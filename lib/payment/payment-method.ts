/**
 * Phương thức thanh toán của link MUA GÓI — CTV chọn ở /payment/create.
 *
 * Link mua gói không có mã khuyến mại trỏ sang checkout Corporate
 * (company.fireant.vn/pay?packageId=…&paymentMethod=…&couponCode=…&userName=…). Tham số
 * paymentMethod= là enum PaymentMethod của FireAnt.Data (Models/Order.cs) và
 * PayController.ProcessPayment rẽ nhánh theo nó:
 *   - 1 BankTransfer: tạo đơn + tài khoản định danh OnePay rồi chuyển thẳng tới ảnh VietQR.
 *   - 3 Card (thẻ nội địa) / 7 Visa (thẻ quốc tế): tạo đơn rồi chuyển sang cổng thẻ OnePay.
 * Đơn nào cũng mang CouponCode của link và được duyệt qua cùng service_ProcessOrder, nên doanh thu
 * CTV tính như nhau (vw_PaidOrders).
 *
 * Thẻ chỉ dùng cho link giá niêm yết: /pay có couponCode luôn tạo đơn giá gốc (huỷ đơn đã trừ mã
 * khuyến mại — xem voucher-link.ts), còn đơn nâng cấp cần UpgradeAmount. Hai loại đó vẫn là QR
 * chuyển khoản trên trang /p/{code}.
 *
 * Module này không import gì phía server — dùng được ở cả client.
 */

export const PAYMENT_METHODS = ["bank", "domestic-card", "intl-card"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Giá trị paymentMethod= của checkout Corporate (enum PaymentMethod của FireAnt.Data). */
const CORPORATE_CODES: Record<PaymentMethod, number> = {
  bank: 1,
  "domestic-card": 3,
  "intl-card": 7,
};

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string; detail: string }> = {
  bank: { label: "Chuyển khoản / QR", detail: "QR định danh · kích hoạt khi nhận tiền" },
  "domestic-card": { label: "Thẻ nội địa", detail: "ATM · Internet Banking" },
  "intl-card": { label: "Thẻ quốc tế", detail: "Visa · Mastercard · JCB" },
};

export function isCardPayment(method: PaymentMethod): boolean {
  return method !== "bank";
}

export function corporatePaymentMethodCode(method: PaymentMethod): number {
  return CORPORATE_CODES[method];
}

/**
 * Phương thức của một PaymentLink. Link trang QR của Partners (nâng cấp, có mã khuyến mại) và link
 * checkout tạo trước khi có lựa chọn này đều là chuyển khoản.
 */
export function paymentMethodOfLink(paymentLink: string | null | undefined): PaymentMethod {
  if (!paymentLink) return "bank";
  let code: number;
  try {
    code = Number(new URL(paymentLink).searchParams.get("paymentMethod"));
  } catch {
    return "bank";
  }
  return PAYMENT_METHODS.find((m) => CORPORATE_CODES[m] === code) ?? "bank";
}
