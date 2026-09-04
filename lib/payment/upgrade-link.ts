/**
 * Link thanh toán của coupon NÂNG CẤP.
 *
 * Coupon mua gói thường lưu PaymentLink trỏ thẳng sang trang checkout của Corporate
 * (company.fireant.vn/pay?packageId=…&couponCode=…&userName=…). Với nâng cấp, khách
 * phải chuyển đúng số tiền chênh lệch qua tài khoản định danh OnePay nên link trỏ về
 * trang QR công khai của Partners: /p/{code}?upgrade=1&… — route /p/[code] nhận diện
 * cờ upgrade=1 để hiển thị QR thay vì redirect.
 *
 * Các query param packageId= và userName= được giữ nguyên tên vì stored procedure
 * usp_ListCoupons / usp_GetCouponByCode parse chúng từ PaymentLink để hiển thị.
 * Module này không import gì phía server — dùng được ở cả client.
 */

export type UpgradeMode = "keep" | "trade";

export type UpgradeLinkParams = {
  /** Gói mới (đích nâng cấp) */
  packageId: number;
  /** Gói gốc đang dùng — service_Orders.UpgradeFromPackageID */
  fromPackageId: number;
  /** Số tiền khách phải chuyển (đã làm tròn 1.000) */
  amount: number;
  userName: string;
  mode: UpgradeMode;
};

export function buildUpgradePaymentLink(
  baseUrl: string,
  code: string,
  params: UpgradeLinkParams,
): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/p/${code}`);
  url.searchParams.set("upgrade", "1");
  url.searchParams.set("packageId", String(params.packageId));
  url.searchParams.set("fromPackageId", String(params.fromPackageId));
  url.searchParams.set("amount", String(Math.round(params.amount)));
  url.searchParams.set("mode", params.mode);
  url.searchParams.set("userName", params.userName);
  return url.toString();
}

export function parseUpgradeLink(paymentLink: string | null | undefined): UpgradeLinkParams | null {
  if (!paymentLink) return null;
  let url: URL;
  try {
    url = new URL(paymentLink);
  } catch {
    return null;
  }
  if (url.searchParams.get("upgrade") !== "1") return null;

  const packageId = Number(url.searchParams.get("packageId"));
  const fromPackageId = Number(url.searchParams.get("fromPackageId"));
  const amount = Number(url.searchParams.get("amount"));
  const userName = url.searchParams.get("userName")?.trim() ?? "";
  const mode: UpgradeMode = url.searchParams.get("mode") === "trade" ? "trade" : "keep";

  if (!Number.isInteger(packageId) || packageId <= 0) return null;
  if (!Number.isInteger(fromPackageId) || fromPackageId <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!userName) return null;

  return { packageId, fromPackageId, amount, userName, mode };
}

export function isUpgradePaymentLink(paymentLink: string | null | undefined): boolean {
  return parseUpgradeLink(paymentLink) !== null;
}
