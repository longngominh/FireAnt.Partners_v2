/** Mã dịch vụ của gói hội viên — dùng khi chưa đọc được mã dịch vụ của đơn. */
export const MEMBER_SERVICE_CODE = "FA";

/**
 * Mã tham chiếu của đơn trên OnePay PayCollect — chính là user reference của tài khoản định
 * danh — và trong nội dung chuyển khoản: "{ServiceCode}{OrderID}". Khóa học (dịch vụ
 * Education) là "ED15387365", gói hội viên là "FA15387365".
 *
 * Phải cùng quy ước với Corporate: PayController (link /pay) tạo và tra tài khoản định danh theo
 * ServiceCode + OrderID. Trước 05/10/2026 Partners luôn dùng "FA" kể cả với khóa học, nên khi
 * khách mở lại link /pay thì Corporate đi tìm "ED{id}", không thấy, và tự hủy đơn khách đã trả
 * tiền (sự cố đơn 15387365). Webhook đọc mã đơn từ dãy số cuối nên tiền về tài khoản FA hay ED
 * đều khớp đúng đơn.
 */
export function orderRef(serviceCode: string | null | undefined, orderId: number): string {
  const code = serviceCode?.trim().toUpperCase();
  return `${code || MEMBER_SERVICE_CODE}${orderId}`;
}

/** Tham chiếu Partners đã dùng cho MỌI đơn trước 05/10/2026 — đơn khóa học cũ vẫn mang tài khoản này. */
export function legacyOrderRef(orderId: number): string {
  return `${MEMBER_SERVICE_CODE}${orderId}`;
}
