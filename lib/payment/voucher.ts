import { getPool, sql } from "@/lib/db/sql";
import { formatVND } from "@/lib/utils/currency";

/**
 * Mã khuyến mại (voucher) admin tạo ở admin.fireant.vn — gọi đúng các proc mà checkout
 * Corporate dùng (FireAnt.Corporate.Web/FireAnt.Data/Scripts/service_DiscountVouchers.sql)
 * để Partners và Corporate áp mã theo cùng một luật:
 *   - service_PreviewVoucher: chỉ đọc, kiểm tra mã + tính số tiền giảm.
 *   - service_ApplyVoucher : ghi service_DiscountVoucherUsages theo OrderID và tăng UsedCount
 *     (lượt dùng bị tính NGAY khi tạo đơn, như Corporate). Các proc đọc đơn —
 *     service_GetOrderWithUserInfo mà webhook OnePay dùng — trả Amount = giá gói − khoản giảm.
 */

/** service_DiscountVouchers.DiscountType */
const TYPE_PERCENT = 1;
const TYPE_AMOUNT = 2;
const TYPE_BONUS_DAYS = 3;
const TYPE_BONUS_PERCENT_DAYS = 4;

/**
 * ResultCode của proc (FireAnt.Data/Models/VoucherResult.cs). Câu chữ của proc viết cho
 * khách tự mua ("Bạn đã sử dụng…"); ở đây người đọc là CTV nên diễn đạt lại.
 */
const RESULT_MESSAGES: Record<number, string> = {
  1: "Mã khuyến mại không tồn tại.",
  2: "Mã khuyến mại đã bị vô hiệu hoá.",
  3: "Mã khuyến mại đã hết hạn.",
  4: "Mã khuyến mại không áp dụng cho gói này.",
  5: "Đây là mã cá nhân, không dành cho tài khoản khách này.",
  6: "Mã khuyến mại đã hết lượt sử dụng.",
  7: "Khách đã dùng mã khuyến mại này rồi.",
  8: "Đơn chưa đạt giá trị tối thiểu để áp dụng mã.",
};

const FALLBACK_MESSAGE = "Chưa kiểm tra được mã khuyến mại, vui lòng thử lại.";

function resultMessage(code: number | null, procMessage: string | null): string {
  if (code !== null && RESULT_MESSAGES[code]) return RESULT_MESSAGES[code];
  return procMessage?.trim() || FALLBACK_MESSAGE;
}

const PERCENT = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** Mô tả mã theo loại, ví dụ "Giảm 10% (tối đa 500.000 ₫)". */
function describeVoucher(type: number | null, value: number | null, maxDiscount: number | null): string {
  const v = value ?? 0;
  switch (type) {
    case TYPE_PERCENT:
      return maxDiscount
        ? `Giảm ${PERCENT.format(v)}% (tối đa ${formatVND(maxDiscount)})`
        : `Giảm ${PERCENT.format(v)}%`;
    case TYPE_AMOUNT:
      return `Giảm ${formatVND(v)}`;
    case TYPE_BONUS_DAYS:
      return `Tặng thêm ${PERCENT.format(v)} ngày sử dụng`;
    case TYPE_BONUS_PERCENT_DAYS:
      return `Tặng thêm ${PERCENT.format(v)}% thời hạn gói`;
    default:
      return "Mã khuyến mại";
  }
}

/** Lợi ích cụ thể của đơn: mã tặng ngày thì lấy câu của proc ("Tặng thêm 30 ngày sử dụng"). */
function benefitOf(type: number | null, discountAmount: number, procMessage: string | null): string {
  if (type === TYPE_BONUS_DAYS || type === TYPE_BONUS_PERCENT_DAYS) {
    return procMessage?.trim() || "Tặng thêm ngày sử dụng";
  }
  return `Giảm ${formatVND(discountAmount)}`;
}

export type VoucherCheck =
  | {
      ok: true;
      code: string;
      title: string;
      discountAmount: number;
      benefit: string;
      expiresAt: Date | null;
      remainingUses: number | null;
    }
  | { ok: false; resultCode: number | null; message: string };

type PreviewRow = {
  DiscountAmount: number | null;
  ResultCode: number | null;
  ResultMsg: string | null;
  DiscountType: number | null;
  DiscountValue: number | null;
  MaxDiscountAmount: number | null;
  ExpiryDate: Date | null;
  MaxUses: number | null;
  UsedCount: number | null;
};

/**
 * Kiểm tra mã cho một gói + một khách mà KHÔNG ghi gì. @userId là AspNetUsers.Id của khách —
 * bắt buộc để kiểm tra mã cá nhân và "khách đã dùng mã chưa".
 */
export async function previewVoucher(input: {
  code: string;
  packageId: number;
  userId: string;
  orderAmount: number;
}): Promise<VoucherCheck> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("Code", sql.NVarChar(20), input.code)
    .input("PackageId", sql.Int, input.packageId)
    .input("UserId", sql.NVarChar(128), input.userId)
    .input("OrderAmount", sql.Decimal(18, 2), input.orderAmount)
    .query<PreviewRow>(`
      DECLARE @DiscountAmount DECIMAL(18, 2), @ResultCode INT, @ResultMsg NVARCHAR(256);

      EXEC [EStocks_Data].[dbo].[service_PreviewVoucher]
        @Code = @Code,
        @PackageId = @PackageId,
        @UserId = @UserId,
        @OrderAmount = @OrderAmount,
        @DiscountAmount = @DiscountAmount OUTPUT,
        @ResultCode = @ResultCode OUTPUT,
        @ResultMsg = @ResultMsg OUTPUT;

      SELECT
        @DiscountAmount AS DiscountAmount,
        @ResultCode     AS ResultCode,
        @ResultMsg      AS ResultMsg,
        v.DiscountType,
        v.DiscountValue,
        v.MaxDiscountAmount,
        v.ExpiryDate,
        v.MaxUses,
        v.UsedCount
      FROM (SELECT 1 AS One) x
      LEFT JOIN [EStocks_Data].[dbo].[service_DiscountVouchers] v ON v.Code = @Code;
    `);

  const row = res.recordset[0];
  const resultCode = row?.ResultCode ?? null;
  if (!row || resultCode !== 0) {
    return { ok: false, resultCode, message: resultMessage(resultCode, row?.ResultMsg ?? null) };
  }

  const discountAmount = Math.round(row.DiscountAmount ?? 0);
  return {
    ok: true,
    code: input.code,
    title: describeVoucher(row.DiscountType, row.DiscountValue, row.MaxDiscountAmount),
    discountAmount,
    benefit: benefitOf(row.DiscountType, discountAmount, row.ResultMsg),
    expiresAt: row.ExpiryDate ?? null,
    remainingUses:
      row.MaxUses !== null && row.UsedCount !== null ? Math.max(0, row.MaxUses - row.UsedCount) : null,
  };
}

export type AppliedOrderVoucher =
  | {
      ok: true;
      discountAmount: number;
      benefit: string;
      /** Số tiền khách phải chuyển — đúng số webhook OnePay đối chiếu */
      netAmount: number;
    }
  | { ok: false; resultCode: number | null; message: string };

type ApplyRow = {
  ResultCode: number | null;
  ResultMsg: string | null;
  DiscountAmount: number | null;
  DiscountType: number | null;
  NetAmount: number | null;
};

/**
 * Ghi mã vào đơn vừa tạo rồi đọc lại số tiền theo đúng công thức
 * service_GetOrderWithUserInfo (giá gói − khoản giảm) để QR khớp tuyệt đối với số tiền
 * webhook OnePay so sánh.
 */
export async function applyVoucherToOrder(input: {
  code: string;
  packageId: number;
  orderId: number;
  userId: string;
  orderAmount: number;
}): Promise<AppliedOrderVoucher> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("Code", sql.NVarChar(20), input.code)
    .input("PackageId", sql.Int, input.packageId)
    .input("OrderId", sql.Int, input.orderId)
    .input("UserId", sql.NVarChar(128), input.userId)
    .input("OrderAmount", sql.Decimal(18, 2), input.orderAmount)
    .query<ApplyRow>(`
      DECLARE @DiscountAmount DECIMAL(18, 2), @ResultCode INT, @ResultMsg NVARCHAR(256);

      EXEC [EStocks_Data].[dbo].[service_ApplyVoucher]
        @Code = @Code,
        @PackageId = @PackageId,
        @OrderId = @OrderId,
        @UserId = @UserId,
        @OrderAmount = @OrderAmount,
        @DiscountAmount = @DiscountAmount OUTPUT,
        @ResultCode = @ResultCode OUTPUT,
        @ResultMsg = @ResultMsg OUTPUT;

      SELECT
        @ResultCode       AS ResultCode,
        @ResultMsg        AS ResultMsg,
        vu.DiscountAmount AS DiscountAmount,
        v.DiscountType    AS DiscountType,
        pkg.Amount - ISNULL(vu.DiscountAmount, 0) AS NetAmount
      FROM [EStocks_Data].[dbo].[service_Orders] so
      INNER JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = so.PackageID
      LEFT  JOIN [EStocks_Data].[dbo].[service_DiscountVoucherUsages] vu ON vu.OrderID = so.OrderID
      LEFT  JOIN [EStocks_Data].[dbo].[service_DiscountVouchers] v ON v.VoucherID = vu.VoucherID
      WHERE so.OrderID = @OrderId;
    `);

  const row = res.recordset[0];
  const resultCode = row?.ResultCode ?? null;
  if (!row || resultCode !== 0) {
    return { ok: false, resultCode, message: resultMessage(resultCode, row?.ResultMsg ?? null) };
  }
  if (row.DiscountAmount === null || row.NetAmount === null) {
    // Proc báo thành công nhưng đơn không có dòng Usages — không được phát QR theo giá đã giảm.
    return { ok: false, resultCode, message: "Không ghi nhận được mã khuyến mại cho đơn. Vui lòng thử lại." };
  }

  const discountAmount = Math.round(row.DiscountAmount);
  return {
    ok: true,
    discountAmount,
    benefit: benefitOf(row.DiscountType, discountAmount, row.ResultMsg),
    netAmount: Math.round(row.NetAmount),
  };
}

/**
 * Huỷ đơn Pending vừa tạo và TRẢ LẠI lượt mã khuyến mại (nếu đã ghi) — dùng khi tạo link
 * thất bại giữa chừng, để đơn không treo giữ lượt của mã. Đi qua proc vòng đời đơn của
 * Corporate (pending_order_lifecycle.sql) để cùng một cách trả lượt.
 */
export async function cancelPendingPartnerOrder(orderId: number, reason: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("OrderID", sql.Int, orderId)
    .input("Reason", sql.NVarChar(256), reason.slice(0, 256))
    .query(`
      DECLARE @r INT;
      EXEC [EStocks_Data].[dbo].[service_CancelPendingOrder]
        @OrderID = @OrderID,
        @Reason = @Reason,
        @Result = @r OUTPUT;
    `);
}
