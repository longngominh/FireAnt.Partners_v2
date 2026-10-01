/**
 * Số điện thoại khách — bắt buộc khi mua gói hội viên / khóa học, giống checkout Corporate
 * (Pay.razor bắt buộc số di động VN trước khi tạo đơn). Số được lưu vào
 * AspNetUsers.PhoneNumber vì ZNS sau thanh toán và webhook khóa học đọc số ở đó.
 *
 * Module này không import gì phía server — dùng được ở cả client.
 */

/** Đầu số di động VN — cùng regex với Pay.razor (VietPhoneRegex), sau khi đã đổi +84/84 → 0. */
const VN_MOBILE_RE = /^0(?:3[2-9]|5[6-9]|7[0-9]|8[1-9]|9[0-9])[0-9]{7}$/;

export const PHONE_INVALID_MESSAGE = "Số điện thoại không hợp lệ (số di động Việt Nam, 10 số).";
export const PHONE_REQUIRED_MESSAGE = "Vui lòng nhập số điện thoại của khách.";

/** Chuẩn hoá về dạng 0xxxxxxxxx (bỏ khoảng trắng, dấu chấm, gạch; +84/84 → 0). Sai → null. */
export function normalizeVnPhone(input: string | null | undefined): string | null {
  let digits = (input ?? "").trim().replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+84")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("84") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return VN_MOBILE_RE.test(digits) ? digits : null;
}

/** Che số khi hiển thị cho CTV: chỉ để lộ 3 số cuối. */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length <= 3 ? "•••" : `•••${digits.slice(-3)}`;
}
