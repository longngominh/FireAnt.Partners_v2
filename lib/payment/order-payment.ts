import { getPool } from "@/lib/db/sql";
import { buildTransferContent, buildVietQRUrl } from "./vietqr";
import { getOnePayClient, isOnePayMock } from "./onepay-client";

const PARTNER_NAME = "FireAnt";

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
  qrPending: boolean;
  isMock: boolean;
};

export async function createPartnerPaymentOrder(
  input: PartnerPaymentOrderInput,
): Promise<PartnerPaymentOrderResult> {
  const existing = await getOrderByCouponCode(input.couponCode);
  if (existing) {
    throw new Error("Mã coupon đã có đơn hàng, không thể tạo đơn thanh toán mới.");
  }

  const orderId = await createOrderRecord(input);
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

  try {
    const account = await getOnePayClient().createVirtualAccount(`FA${orderId}`, PARTNER_NAME);
    accountNumber = account.accountNumber;
    qrCodeUrl = buildVietQRUrl({
      accountNumber,
      amount,
      addInfo: buildTransferContent(orderId),
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
    qrPending,
    isMock: isOnePayMock(),
  };
}

type ExistingOrderRow = {
  OrderID: number;
  Amount: number | null;
  Status: number | null;
  IsPaid: boolean | null;
};

async function getOrderByCouponCode(
  couponCode: string,
): Promise<{ orderId: number; amount: number; isPaid: boolean } | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("CouponCode", couponCode)
    .query<ExistingOrderRow>(`
      SELECT TOP (1)
        so.OrderID,
        pkg.Amount,
        so.Status,
        so.IsPaid
      FROM [EStocks_Data].[dbo].[service_Orders] so
      LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = so.PackageID
      WHERE so.CouponCode = @CouponCode
      ORDER BY
        CASE WHEN so.Status = 1 OR so.IsPaid = 1 THEN 0 ELSE 1 END,
        so.OrderDate DESC,
        so.OrderID DESC;
    `);

  const row = result.recordset[0];
  if (!row?.OrderID) return null;

  return {
    orderId: row.OrderID,
    amount: row.Amount ?? 0,
    isPaid: row.Status === 1 || row.IsPaid === true,
  };
}

async function getPackageAmount(packageId: number): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("PackageID", packageId)
    .query<{ Amount: number }>(`
      SELECT TOP (1) Amount
      FROM [EStocks_Data].[dbo].[service_Packages]
      WHERE PackageID = @PackageID;
    `);

  const amount = result.recordset[0]?.Amount;
  if (typeof amount !== "number" || amount < 0) {
    throw new Error("Không tìm thấy giá gói để tạo QR thanh toán.");
  }

  return amount;
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

async function createOrderRecord(input: PartnerPaymentOrderInput): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("PackageID", input.packageId)
    .input("PaymentMethod", 1)
    .input("UserName", input.userName)
    .input("OrderDate", new Date())
    .input("Comment", input.note ?? "")
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
        @Status = 0,
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
