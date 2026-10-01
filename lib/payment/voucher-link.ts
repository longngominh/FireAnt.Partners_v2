/**
 * Mã khuyến mại (voucher) trên link MUA GÓI của CTV — phần dùng chung server + client.
 *
 * Voucher do admin tạo ở admin.fireant.vn (EStocks_Data.dbo.service_DiscountVouchers); CTV chỉ
 * nhập mã. Coupon mua gói thường trỏ thẳng sang checkout Corporate
 * (company.fireant.vn/pay?…&couponCode=…), nhưng đường đó KHÔNG dùng được cho đơn đã áp voucher:
 * PayController.ProcessPayment có couponCode thì hủy mọi đơn Pending cùng khách + cùng gói
 * (service_CancelPendingOrder trả lại lượt voucher) rồi tạo đơn mới với GIÁ GỐC. Vì vậy, giống link
 * nâng cấp, link có voucher trỏ về trang QR công khai của Partners:
 *   /p/{code}?voucher=…&packageId=…&userName=…
 * Trang đó đọc lại đơn đã tạo sẵn (giá đã trừ voucher) và hiển thị QR đúng số tiền mà webhook
 * OnePay sẽ đối chiếu.
 *
 * Các query param packageId= và userName= giữ nguyên tên vì usp_ListCoupons / usp_GetCouponByCode
 * parse chúng từ PaymentLink để hiển thị. Module này không import gì phía server.
 */
import { isUpgradePaymentLink } from "./upgrade-link";

/** Admin lưu mã CHỮ IN HOA, 4–20 ký tự chữ/số (service_CreateDiscountVoucher). */
export const VOUCHER_CODE_RE = /^[A-Z0-9]{4,20}$/;

/** Chuẩn hoá chuỗi CTV gõ/dán: bỏ khoảng trắng, in hoa. */
export function normalizeVoucherCode(input: string | null | undefined): string {
  return (input ?? "").replace(/\s+/g, "").toUpperCase();
}

export type VoucherLinkParams = {
  packageId: number;
  userName: string;
  voucherCode: string;
};

export function buildVoucherPaymentLink(baseUrl: string, code: string, params: VoucherLinkParams): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/p/${code}`);
  url.searchParams.set("voucher", params.voucherCode);
  url.searchParams.set("packageId", String(params.packageId));
  url.searchParams.set("userName", params.userName);
  return url.toString();
}

export function parseVoucherPaymentLink(paymentLink: string | null | undefined): VoucherLinkParams | null {
  if (!paymentLink) return null;
  let url: URL;
  try {
    url = new URL(paymentLink);
  } catch {
    return null;
  }

  const voucherCode = normalizeVoucherCode(url.searchParams.get("voucher"));
  const packageId = Number(url.searchParams.get("packageId"));
  const userName = url.searchParams.get("userName")?.trim() ?? "";

  if (!VOUCHER_CODE_RE.test(voucherCode)) return null;
  if (!Number.isInteger(packageId) || packageId <= 0) return null;
  if (!userName) return null;

  return { packageId, userName, voucherCode };
}

export function isVoucherPaymentLink(paymentLink: string | null | undefined): boolean {
  return parseVoucherPaymentLink(paymentLink) !== null;
}

/**
 * Link trỏ về trang QR công khai của Partners (/p/{code}) thay vì checkout Corporate:
 * gửi khách link rút gọn, không gửi PaymentLink kèm tham số nội bộ.
 */
export function isHostedPaymentLink(paymentLink: string | null | undefined): boolean {
  return isUpgradePaymentLink(paymentLink) || isVoucherPaymentLink(paymentLink);
}
