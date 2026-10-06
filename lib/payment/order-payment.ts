import { getPool, sql } from "@/lib/db/sql";
import { buildTransferContent, buildVietQRUrl } from "./vietqr";
import { getOnePayClient, isOnePayMock, type OnePayAccount } from "./onepay-client";
import { legacyOrderRef, orderRef } from "./order-ref";
import { isUpgradePaymentLink } from "./upgrade-link";
import { isVoucherPaymentLink } from "./voucher-link";
import { applyVoucherToOrder, cancelPendingPartnerOrder } from "./voucher";

const PARTNER_NAME = "FireAnt";

/** service_Orders.Status — mirror enum OrderStatus của FireAnt.Data */
const ORDER_STATUS_PENDING = 0;
const ORDER_STATUS_APPROVED = 1;
const ORDER_STATUS_CANCELLED = 2;
const ORDER_STATUS_INVALID = 3;
const ORDER_STATUS_UPGRADE = 6;

/** Mã khuyến mại không áp được vào đơn — action báo lỗi ở ô mã, không phải lỗi hệ thống. */
export class VoucherApplyError extends Error {}

/** Khách không chuyển được 0 ₫ nên mã giảm hết giá gói không tạo được link chuyển khoản. */
export const VOUCHER_FULL_DISCOUNT_MESSAGE =
  "Mã giảm toàn bộ giá gói nên không tạo được link chuyển khoản. Vui lòng liên hệ FireAnt để kích hoạt cho khách.";

export type PartnerPaymentOrderInput = {
  packageId: number;
  userName: string;
  /** Giá niêm yết của gói */
  amount: number;
  couponCode: string;
  note?: string | null;
  staff: string;
  /** Mã khuyến mại (đã kiểm tra) + AspNetUsers.Id của khách */
  voucher?: { code: string; userId: string } | null;
};

export type PartnerPaymentOrderResult = {
  orderId: number;
  /** Tham chiếu của đơn trên OnePay + nội dung chuyển khoản: "ED15387365" (khóa học) / "FA15387365" */
  orderRef: string;
  /** Số tiền trên QR — đã trừ mã khuyến mại nếu có */
  amount: number;
  qrCodeUrl: string;
  accountNumber: string;
  transferContent: string;
  qrPending: boolean;
  isMock: boolean;
  /** Mã khuyến mại vừa ghi vào đơn mới tạo (null khi dùng lại đơn có sẵn) */
  voucher: { discountAmount: number; benefit: string } | null;
};

export type PartnerUpgradeOrderInput = {
  /** Gói mới (đích nâng cấp) */
  newPackageId: number;
  /** Gói gốc — service_Orders.UpgradeFromPackageID */
  oldPackageId: number;
  userName: string;
  /** Số tiền khách phải chuyển (đã làm tròn 1.000) */
  amount: number;
  couponCode: string;
  /** Mô tả phương án, ghi vào Comment đơn hàng */
  modeLabel: string;
  note?: string | null;
  staff: string;
};

export async function createPartnerPaymentOrder(
  input: PartnerPaymentOrderInput,
): Promise<PartnerPaymentOrderResult> {
  const existing = await getOrderByCouponCode(input.couponCode);
  if (existing) {
    throw new Error("Mã coupon đã có đơn hàng, không thể tạo đơn thanh toán mới.");
  }

  const orderId = await createOrderRecord({
    packageId: input.packageId,
    userName: input.userName,
    couponCode: input.couponCode,
    comment: input.note ?? "",
    staff: input.staff,
  });

  if (!input.voucher) {
    return buildPaymentOrderResult(orderId, input.amount, { isNew: true });
  }

  // Mã khuyến mại ghi theo OrderID nên chỉ áp được SAU khi có đơn (giống Pay.razor). Áp
  // không được (hết lượt giữa lúc kiểm tra và lúc tạo…) thì huỷ đơn — không phát QR giá gốc
  // cho một link mà CTV tưởng là đã giảm.
  let applied: Awaited<ReturnType<typeof applyVoucherToOrder>>;
  try {
    applied = await applyVoucherToOrder({
      code: input.voucher.code,
      packageId: input.packageId,
      orderId,
      userId: input.voucher.userId,
      orderAmount: input.amount,
    });
  } catch (err) {
    await cancelPartnerOrderQuietly(orderId, `Loi khi ap ma khuyen mai ${input.voucher.code}`);
    throw err;
  }

  if (!applied.ok) {
    await cancelPartnerOrderQuietly(orderId, `Khong ap duoc ma khuyen mai ${input.voucher.code} (result=${applied.resultCode})`);
    throw new VoucherApplyError(applied.message);
  }
  if (applied.netAmount <= 0) {
    await cancelPartnerOrderQuietly(orderId, `Ma khuyen mai ${input.voucher.code} giam toan bo gia goi`);
    throw new VoucherApplyError(VOUCHER_FULL_DISCOUNT_MESSAGE);
  }

  const result = await buildPaymentOrderResult(orderId, applied.netAmount, { isNew: true });
  return { ...result, voucher: { discountAmount: applied.discountAmount, benefit: applied.benefit } };
}

/** Huỷ đơn + trả lượt mã; lỗi ở bước dọn dẹp chỉ ghi log để không che lỗi gốc. */
export async function cancelPartnerOrderQuietly(orderId: number, reason: string): Promise<void> {
  try {
    await cancelPendingPartnerOrder(orderId, reason);
  } catch (err) {
    console.error(`[partner-payment] Không huỷ được đơn ${orderId} (${reason}):`, err);
  }
}

/**
 * Tạo đơn NÂNG CẤP tự động do đối tác khởi tạo — mirror CreateUpgradeOrder trong
 * Corporate Upgrade.razor:
 *   1. Tạo đơn Pending cho gói mới (service_CreateOrderFromAdmin) + gắn CouponCode.
 *   2. service_PrepareUpgradeOrder gán UpgradeAmount + UpgradeFromPackageID để webhook
 *      OnePay (company.fireant.vn) nhận diện đơn nâng cấp và gọi service_ProcessUpgradeOrder.
 *   3. Đọc lại UpgradeAmount để chắc chắn số tiền trên QR khớp với số DB sẽ đối chiếu.
 *   4. Tạo tài khoản định danh OnePay {ServiceCode}{orderId} (gói hội viên → luôn FA) + VietQR
 *      với số tiền nâng cấp.
 */
export async function createPartnerUpgradeOrder(
  input: PartnerUpgradeOrderInput,
): Promise<PartnerPaymentOrderResult> {
  const existing = await getOrderByCouponCode(input.couponCode);
  if (existing) {
    throw new Error("Mã coupon đã có đơn hàng, không thể tạo đơn nâng cấp mới.");
  }

  const comment = [
    `DON NANG CAP TU DONG QUA QR (${input.modeLabel}, tu goi #${input.oldPackageId}) - KHONG DUYET TAY - CTV`,
    input.note?.trim() || null,
  ]
    .filter(Boolean)
    .join(" - ");

  const orderId = await createOrderRecord({
    packageId: input.newPackageId,
    userName: input.userName,
    couponCode: input.couponCode,
    comment,
    staff: input.staff,
  });

  const pool = await getPool();
  const prepared = await pool
    .request()
    .input("OrderID", sql.Int, orderId)
    .input("Amount", sql.Float, input.amount)
    .input("OldPackageID", sql.Int, input.oldPackageId)
    .query<{ Result: number; UpgradeAmount: number | null }>(`
      DECLARE @r INT;
      EXEC [EStocks_Data].[dbo].[service_PrepareUpgradeOrder]
        @Result = @r OUTPUT,
        @OrderID = @OrderID,
        @Amount = @Amount,
        @OldPackageID = @OldPackageID;

      SELECT @r AS Result, UpgradeAmount
      FROM [EStocks_Data].[dbo].[service_Orders]
      WHERE OrderID = @OrderID;
    `);

  const row = prepared.recordset[0];
  const prepareResult = row?.Result ?? 0;
  const upgradeAmount = row?.UpgradeAmount ?? null;

  if (prepareResult !== 1 || upgradeAmount === null || Math.abs(upgradeAmount - input.amount) > 0.5) {
    // Đơn Pending không có UpgradeAmount sẽ bị webhook xử lý như đơn mua gói thường
    // (kích hoạt trọn gói với số tiền nhỏ hơn) — vô hiệu hoá ngay để an toàn.
    await pool
      .request()
      .input("OrderID", sql.Int, orderId)
      .input("Comment", sql.NVarChar(sql.MAX), `${comment} - HUY: khong chuan bi duoc don nang cap (result=${prepareResult})`)
      .query(`
        UPDATE [EStocks_Data].[dbo].[service_Orders]
        SET [Status] = ${ORDER_STATUS_INVALID}, Comment = @Comment
        WHERE OrderID = @OrderID AND [Status] = ${ORDER_STATUS_PENDING};
      `);

    if (prepareResult === -1) {
      throw new Error(
        "Tài khoản khách thuộc diện đặc biệt (tài trợ/dùng thử) nên chưa hỗ trợ nâng cấp tự động. Vui lòng liên hệ FireAnt.",
      );
    }
    if (prepareResult === 1) {
      throw new Error("Hệ thống thanh toán chưa sẵn sàng cho nâng cấp tự động (UpgradeAmount lệch). Vui lòng liên hệ FireAnt.");
    }
    throw new Error("Không chuẩn bị được đơn nâng cấp. Vui lòng thử lại.");
  }

  return buildPaymentOrderResult(orderId, input.amount, { isNew: true });
}

export async function getOrCreatePartnerPaymentOrder(params: {
  couponCode: string;
  paymentLink: string;
  note?: string | null;
  staff: string;
}): Promise<PartnerPaymentOrderResult> {
  const existing = await getOrderByCouponCode(params.couponCode);
  const hasVoucher = isVoucherPaymentLink(params.paymentLink);
  if (existing) {
    if (existing.isPaid) {
      throw new Error("Đơn hàng gắn với mã coupon này đã thanh toán, không thể dùng lại QR.");
    }
    if (hasVoucher && existing.isClosed) {
      // Đơn có mã khuyến mại đã bị huỷ (khách tự mua lại cùng gói trên fireant.vn, quá hạn
      // chuyển khoản…): lượt mã đã được trả lại nên đơn về giá gốc — không phát lại QR.
      throw new Error("Đơn của link này đã bị huỷ nên mã khuyến mại không còn giữ. Vui lòng tạo link mới.");
    }

    return buildPaymentOrderResult(existing.orderId, existing.amount, { isNew: false });
  }

  if (isUpgradePaymentLink(params.paymentLink)) {
    // Đơn nâng cấp luôn được tạo cùng lúc với coupon; không tự tạo lại để tránh
    // sinh đơn mua trọn gói với giá niêm yết.
    throw new Error("Không tìm thấy đơn nâng cấp của mã này. Vui lòng tạo link nâng cấp mới.");
  }
  if (hasVoucher) {
    // Tương tự: tạo lại ở đây sẽ ra đơn giá gốc, mất mã khuyến mại.
    throw new Error("Không tìm thấy đơn của link có mã khuyến mại. Vui lòng tạo link mới.");
  }

  const parsed = parsePaymentLink(params.paymentLink);
  const amount = await getPackageAmount(parsed.packageId);
  return createPartnerPaymentOrder({
    packageId: parsed.packageId,
    userName: parsed.userName,
    amount,
    couponCode: params.couponCode,
    note: params.note,
    staff: params.staff,
  });
}

/**
 * Cấp (hoặc đọc lại) tài khoản định danh OnePay của đơn + dựng VietQR.
 *
 * Tham chiếu theo mã dịch vụ của gói: khóa học "ED{id}", hội viên "FA{id}" — xem
 * lib/payment/order-ref.ts. Đơn có sẵn (isNew = false) của khóa học tạo TRƯỚC khi đổi quy ước
 * đã được cấp tài khoản "FA{id}" và khách có thể đã lưu / đã chuyển vào số đó: đọc lại đúng tài
 * khoản ấy thay vì cấp thêm một số "ED{id}" khác cho cùng đơn.
 */
async function buildPaymentOrderResult(
  orderId: number,
  amount: number,
  options: { isNew: boolean },
): Promise<PartnerPaymentOrderResult> {
  let accountNumber = "";
  let qrCodeUrl = "";
  let qrPending = false;

  const ref = orderRef(await getOrderServiceCode(orderId), orderId);
  let usedRef = ref;

  try {
    const client = getOnePayClient();
    let account: OnePayAccount | null = null;

    if (!options.isNew && ref !== legacyOrderRef(orderId)) {
      account = await client.findVirtualAccount(legacyOrderRef(orderId));
    }
    account ??= await client.createVirtualAccount(ref, PARTNER_NAME);

    usedRef = account.orderRef;
    accountNumber = account.accountNumber;
    qrCodeUrl = buildVietQRUrl({
      accountNumber,
      amount,
      addInfo: buildTransferContent(usedRef),
      accountName: PARTNER_NAME,
    });
  } catch (err) {
    console.error(`[partner-payment] OnePay error for ${ref}:`, err);
    qrPending = true;
  }

  return {
    orderId,
    orderRef: usedRef,
    amount,
    qrCodeUrl,
    accountNumber,
    transferContent: buildTransferContent(usedRef),
    qrPending,
    isMock: isOnePayMock(),
    voucher: null,
  };
}

/** Mã dịch vụ của gói trên đơn ("ED" khóa học, "FA" hội viên); null khi không đọc được. */
async function getOrderServiceCode(orderId: number): Promise<string | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("OrderID", sql.Int, orderId)
    .query<{ ServiceCode: string | null }>(`
      SELECT TOP (1) s.ServiceCode
      FROM [EStocks_Data].[dbo].[service_Orders] o
      INNER JOIN [EStocks_Data].[dbo].[service_Packages] p ON p.PackageID = o.PackageID
      INNER JOIN [EStocks_Data].[dbo].[service_Services] s ON s.ServiceID = p.ServiceID
      WHERE o.OrderID = @OrderID;
    `);

  return result.recordset[0]?.ServiceCode ?? null;
}

type ExistingOrderRow = {
  OrderID: number;
  ServiceCode: string | null;
  Amount: number | null;
  ListAmount: number | null;
  UpgradeAmount: number | null;
  VoucherDiscount: number | null;
  Status: number | null;
  IsPaid: boolean | null;
  EndDate: Date | null;
};

export type CouponOrderState = {
  orderId: number;
  /** Mã dịch vụ của gói ("ED" khóa học, "FA" hội viên) — dựng tham chiếu đơn, xem order-ref.ts */
  serviceCode: string | null;
  /**
   * Số tiền khách phải chuyển: UpgradeAmount với đơn nâng cấp; giá gói trừ khoản giảm của
   * mã khuyến mại với đơn thường (đúng công thức service_GetOrderWithUserInfo của webhook).
   */
  amount: number;
  /** Giá niêm yết của gói trên đơn */
  listAmount: number;
  /** Khoản giảm của mã khuyến mại đang ghi trên đơn (null = không có mã) */
  voucherDiscount: number | null;
  isPaid: boolean;
  isUpgrade: boolean;
  /** Đơn đã huỷ / vô hiệu — không còn nhận thanh toán theo giá đã chốt */
  isClosed: boolean;
  status: number | null;
  endDate: Date | null;
};

export async function getOrderByCouponCode(couponCode: string): Promise<CouponOrderState | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("CouponCode", couponCode)
    .query<ExistingOrderRow>(`
      SELECT TOP (1)
        so.OrderID,
        svc.ServiceCode,
        pkg.Amount - ISNULL(vu.DiscountAmount, 0) AS Amount,
        pkg.Amount AS ListAmount,
        so.UpgradeAmount,
        vu.DiscountAmount AS VoucherDiscount,
        so.Status,
        so.IsPaid,
        so.EndDate
      FROM [EStocks_Data].[dbo].[service_Orders] so
      LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = so.PackageID
      LEFT JOIN [EStocks_Data].[dbo].[service_Services] svc ON svc.ServiceID = pkg.ServiceID
      LEFT JOIN [EStocks_Data].[dbo].[service_DiscountVoucherUsages] vu ON vu.OrderID = so.OrderID
      WHERE so.CouponCode = @CouponCode
      ORDER BY
        CASE WHEN so.Status IN (${ORDER_STATUS_APPROVED}, ${ORDER_STATUS_UPGRADE}) OR so.IsPaid = 1 THEN 0 ELSE 1 END,
        so.OrderDate DESC,
        so.OrderID DESC;
    `);

  const row = result.recordset[0];
  if (!row?.OrderID) return null;

  const isPaid =
    row.Status === ORDER_STATUS_APPROVED ||
    row.Status === ORDER_STATUS_UPGRADE ||
    row.IsPaid === true;

  return {
    orderId: row.OrderID,
    serviceCode: row.ServiceCode ?? null,
    amount: row.UpgradeAmount ?? row.Amount ?? 0,
    listAmount: row.ListAmount ?? 0,
    voucherDiscount: row.VoucherDiscount,
    isPaid,
    isUpgrade: row.UpgradeAmount !== null,
    isClosed: !isPaid && (row.Status === ORDER_STATUS_CANCELLED || row.Status === ORDER_STATUS_INVALID),
    status: row.Status,
    endDate: row.EndDate,
  };
}

export type PackageInfo = {
  packageId: number;
  serviceId: number | null;
  months: number;
  amount: number;
  packageName: string | null;
};

export async function getPackageInfo(packageId: number): Promise<PackageInfo> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("PackageID", packageId)
    .query<{ PackageID: number; ServiceID: number | null; Months: number; Amount: number; PackageName: string | null }>(`
      SELECT TOP (1) PackageID, ServiceID, Months, Amount, PackageName
      FROM [EStocks_Data].[dbo].[service_Packages]
      WHERE PackageID = @PackageID;
    `);

  const row = result.recordset[0];
  if (!row || typeof row.Amount !== "number" || row.Amount < 0) {
    throw new Error("Không tìm thấy gói dịch vụ.");
  }

  return {
    packageId: row.PackageID,
    serviceId: row.ServiceID,
    months: row.Months,
    amount: row.Amount,
    packageName: row.PackageName,
  };
}

async function getPackageAmount(packageId: number): Promise<number> {
  try {
    return (await getPackageInfo(packageId)).amount;
  } catch {
    throw new Error("Không tìm thấy giá gói để tạo QR thanh toán.");
  }
}

function parsePaymentLink(paymentLink: string): { packageId: number; userName: string } {
  const url = new URL(paymentLink);
  const packageId = Number(url.searchParams.get("packageId"));
  const userName = url.searchParams.get("userName")?.trim() ?? "";

  if (!packageId || !userName) {
    throw new Error("Link thanh toán thiếu packageId hoặc userName.");
  }

  return {
    packageId,
    userName,
  };
}

async function createOrderRecord(input: {
  packageId: number;
  userName: string;
  couponCode: string;
  comment: string;
  staff: string;
}): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("PackageID", input.packageId)
    .input("PaymentMethod", 1)
    .input("UserName", input.userName)
    .input("OrderDate", new Date())
    .input("Comment", input.comment)
    .input("Staff", input.staff)
    .input("CouponCode", input.couponCode)
    .query<{ OrderID: number }>(`
      DECLARE @lockResource NVARCHAR(255) = N'partner-payment-coupon:' + CONVERT(NVARCHAR(50), @CouponCode);
      DECLARE @lockResult INT;
      EXEC @lockResult = sp_getapplock
        @Resource = @lockResource,
        @LockMode = 'Exclusive',
        @LockOwner = 'Session',
        @LockTimeout = 10000;

      IF @lockResult < 0
      BEGIN
        THROW 51000, 'Không thể khóa mã coupon để tạo đơn thanh toán.', 1;
      END;

      DECLARE @existingOrderID INT;
      SELECT TOP (1) @existingOrderID = OrderID
      FROM [EStocks_Data].[dbo].[service_Orders]
      WHERE CouponCode = @CouponCode
      ORDER BY OrderDate DESC, OrderID DESC;

      IF @existingOrderID IS NOT NULL
      BEGIN
        THROW 51001, 'Mã coupon đã có đơn hàng, không thể tạo đơn thanh toán mới.', 1;
      END;

      DECLARE @oid INT;

      EXEC [EStocks_Data].[dbo].[service_CreateOrderFromAdmin]
        @OrderID = @oid OUTPUT,
        @PackageID = @PackageID,
        @CardID = NULL,
        @PaymentMethod = @PaymentMethod,
        @UserName = @UserName,
        @OrderDate = @OrderDate,
        @StartDate = NULL,
        @EndDate = NULL,
        @Status = ${ORDER_STATUS_PENDING},
        @Comment = @Comment,
        @IsPaid = 0,
        @DealerUserName = NULL,
        @Staff = @Staff;

      UPDATE [EStocks_Data].[dbo].[service_Orders]
      SET CouponCode = @CouponCode
      WHERE OrderID = @oid;

      SELECT @oid AS OrderID;
    `);

  const orderId = result.recordset[0]?.OrderID;
  if (!orderId || orderId <= 0) {
    throw new Error("Không thể tạo đơn thanh toán.");
  }

  return orderId;
}
