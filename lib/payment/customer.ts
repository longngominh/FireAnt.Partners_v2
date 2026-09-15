import { findFireAntUser } from "@/lib/data/identity";

/** Đủ chặt để loại các chuỗi rõ ràng không phải email, không cố bắt mọi RFC. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class CustomerUserNameError extends Error {}

export type ResolvedCustomer = {
  /** Chuỗi sẽ ghi vào service_Orders.UserName — cũng là khoá quyền lợi sau này */
  userName: string;
  /** Đã có tài khoản FireAnt khớp username/email này chưa */
  hasAccount: boolean;
};

/**
 * CTV được phép bán cho email CHƯA CÓ tài khoản FireAnt ("thu tiền trước, tạo tài khoản sau").
 *
 * - Đã có tài khoản  → dùng UserName chuẩn trong DB (đúng hoa/thường).
 * - Chưa có tài khoản → BẮT BUỘC phải là email, và chuẩn hoá về chữ thường.
 *
 * Vì sao bắt buộc email + chữ thường: chuỗi này đi thẳng vào service_Orders.UserName, rồi
 * service_ProcessOrder ghi quyền lợi vào service_ServiceSubscribers theo đúng chuỗi đó.
 * Khách chỉ nhận được gói khi sau này đăng ký trùng khớp — một chữ hoa lệch hay một
 * username không bao giờ tồn tại là tiền đã thu mà khách không dùng được gói.
 * (Sự cố 15/09/2026: đơn 15369420 ghi "Tuanhhq0108@gmail.com".)
 */
export async function resolveCustomerUserName(input: string): Promise<ResolvedCustomer> {
  const value = input.trim();

  const existing = await findFireAntUser(value);
  if (existing) {
    return { userName: existing.userName, hasAccount: true };
  }

  if (!EMAIL_RE.test(value)) {
    throw new CustomerUserNameError(
      "Chưa có tài khoản FireAnt nào khớp. Nếu khách chưa có tài khoản, hãy nhập email khách sẽ dùng để đăng ký.",
    );
  }

  return { userName: value.toLowerCase(), hasAccount: false };
}
