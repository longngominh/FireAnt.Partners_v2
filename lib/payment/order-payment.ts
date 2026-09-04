import { getPool, sql } from "@/lib/db/sql";
import { buildTransferContent, buildVietQRUrl } from "./vietqr";
import { getOnePayClient, isOnePayMock } from "./onepay-client";
import { isUpgradePaymentLink } from "./upgrade-link";

const PARTNER_NAME = "FireAnt";

/** service_Orders.Status — mirror enum OrderStatus của FireAnt.Data */
const ORDER_STATUS_PENDING = 0;
const ORDER_STATUS_APPROVED = 1;
const ORDER_STATUS_INVALID = 3;
const ORDER_STATUS_UPGRADE = 6;

export type PartnerPaymentOrderInput = {
  packageId: number;
  userName: string;
  amount: number;
  couponCode: string;
  note?: string | null;
  staff: string;
};

export type PartnerPaymentOrderResult = {
  orderId: number;
  qrCodeUrl: string;
  accountNumber: string;
  transferContent: string;
  qrPending: boolean;
  isMock: boolean;
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
  return buildPaymentOrderResult(orderId, input.amount);
}

/**
 * Tạo đơn NÂNG CẤP tự động do đối tác khởi tạo — mirror CreateUpgradeOrder trong
 * Corporate Upgrade.razor:
 *   1. Tạo đơn Pending cho gói mới (service_CreateOrderFromAdmin) + gắn CouponCode.
 *   2. service_PrepareUpgradeOrder gán UpgradeAmount + UpgradeFromPackageID để webhook
 *      OnePay (company.fireant.vn) nhận diện đơn nâng cấp và gọi service_ProcessUpgradeOrder.
 *   3. Đọc lại UpgradeAmount để chắc chắn số tiền trên QR khớp với số DB sẽ đối chiếu.
 *   4. Tạo tài khoản định danh OnePay FA{orderId} + VietQR với số tiền nâng cấp.
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

  return buildPaymentOrderResult(orderId, input.amount);
}

export async function getOrCreatePartnerPaymentOrder(params: {
  couponCode: string;
  paymentLink: string;
  note?: string | null;
  staff: string;
}): Promise<PartnerPaymentOrderResult> {
  const existing = await getOrderByCouponCode(params.couponCode);
  if (existing) {
    if (existing.isPaid) {
      throw new Error("Đơn hàng gắn với mã coupon này đã thanh toán, không thể dùng lại QR.");
    }

    return buildPaymentOrderResult(existing.orderId, existing.amount);
  }

  if (isUpgradePaymentLink(params.paymentLink)) {
    // Đơn nâng cấp luôn được tạo cùng lúc với coupon; không tự tạo lại để tránh
    // sinh đơn mua trọn gói với giá niêm yết.
    throw new Error("Không tìm thấy đơn nâng cấp của mã này. Vui lòng tạo link nâng cấp mới.");
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

async function buildPaymentOrderResult(
  orderId: number,
  amount: number,
): Promise<PartnerPaymentOrderResult> {
  let accountNumber = "";
  let qrCodeUrl = "";
  let qrPending = false;
  const transferContent = buildTransferContent(orderId);

  try {
    const account = await getOnePayClient().createVirtualAccount(`FA${orderId}`, PARTNER_NAME);
    accountNumber = account.accountNumber;
    qrCodeUrl = buildVietQRUrl({
      accountNumber,
      amount,
      addInfo: transferContent,
      accountName: PARTNER_NAME,
    });
  } catch (err) {
    console.error(`[partner-payment] OnePay error for FA-${orderId}:`, err);
    qrPending = true;
  }

  return {
    orderId,
    qrCodeUrl,
    accountNumber,
    transferContent,
    qrPending,
    isMock: isOnePayMock(),
  };
}

type ExistingOrderRow = {
  OrderID: number;
  Amount: number | null;
  UpgradeAmount: number | null;
  Status: number | null;
  IsPaid: boolean | null;
  EndDate: Date | null;
};

export type CouponOrderState = {
  orderId: number;
  /** Số tiền khách phải chuyển: UpgradeAmount với đơn nâng cấp, giá gói với đơn thường */
  amount: number;
  isPaid: boolean;
  isUpgrade: boolean;
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
        pkg.Amount,
        so.UpgradeAmount,
        so.Status,
        so.IsPaid,
        so.EndDate
      FROM [EStocks_Data].[dbo].[service_Orders] so
      LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = so.PackageID
      WHERE so.CouponCode = @CouponCode
      ORDER BY
        CASE WHEN so.Status IN (${ORDER_STATUS_APPROVED}, ${ORDER_STATUS_UPGRADE}) OR so.IsPaid = 1 THEN 0 ELSE 1 END,
        so.OrderDate DESC,
        so.OrderID DESC;
    `);

  const row = result.recordset[0];
  if (!row?.OrderID) return null;

  return {
    orderId: row.OrderID,
    amount: row.UpgradeAmount ?? row.Amount ?? 0,
    isPaid:
      row.Status === ORDER_STATUS_APPROVED ||
      row.Status === ORDER_STATUS_UPGRADE ||
      row.IsPaid === true,
    isUpgrade: row.UpgradeAmount !== null,
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
