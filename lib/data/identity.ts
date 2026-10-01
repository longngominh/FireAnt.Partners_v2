import { getPool, sql } from "@/lib/db/sql";

export type FireAntUser = {
  /** AspNetUsers.Id — khoá mà voucher cá nhân (service_DiscountVouchers.UserID) so khớp */
  id: string;
  userName: string;
  email: string | null;
  /** AspNetUsers.PhoneNumber — chỉ dùng phía server, ra client thì che (maskPhone) */
  phoneNumber: string | null;
};

/**
 * Tìm tài khoản FireAnt theo username hoặc email đăng nhập.
 * Trả về UserName chuẩn (canonical) để dùng cho link thanh toán và đơn hàng.
 */
export async function findFireAntUser(
  userNameOrEmail: string,
): Promise<FireAntUser | null> {
  const value = userNameOrEmail.trim();
  if (!value) return null;

  const pool = await getPool();
  const res = await pool
    .request()
    .input("Value", sql.NVarChar(256), value)
    .query<{ Id: string; UserName: string; Email: string | null; PhoneNumber: string | null }>(`
      SELECT TOP 1 Id, UserName, Email, PhoneNumber
      FROM NEWFA.FireAnt_Identity.dbo.AspNetUsers
      WHERE UserName = @Value OR Email = @Value;
    `);

  const row = res.recordset[0];
  if (!row?.UserName) return null;

  return {
    id: row.Id,
    userName: row.UserName,
    email: row.Email ?? null,
    phoneNumber: row.PhoneNumber?.trim() || null,
  };
}

/**
 * Ghi số điện thoại vào tài khoản FireAnt CHƯA CÓ số (linked server NEWFA → FireAnt_Identity).
 *
 * - Không bao giờ ghi đè số đã có: khách đổi số phải tự xác thực OTP ở fireant.vn.
 * - PhoneNumberConfirmed = 0: số do CTV nhập, chưa xác thực. Các chức năng cần số đã xác thực
 *   (OTP giao dịch, mở tài khoản chứng khoán…) vẫn bắt khách xác thực; ZNS sau thanh toán và
 *   webhook khóa học thì dùng được ngay (đọc PhoneNumber, không xét Confirmed).
 * - Cùng cách Admin_V3 sửa số hội viên (modules/members/service.ts).
 *
 * Trả về true nếu đã ghi; false nếu tài khoản đã có số / không tồn tại.
 */
export async function setFireAntUserPhoneIfEmpty(userId: string, phone: string): Promise<boolean> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("UserId", sql.NVarChar(128), userId)
    .input("Phone", sql.NVarChar(20), phone)
    .query<{ Updated: number }>(`
      SET XACT_ABORT ON;

      UPDATE NEWFA.FireAnt_Identity.dbo.AspNetUsers
      SET PhoneNumber = @Phone,
          PhoneNumberConfirmed = 0
      WHERE Id = @UserId
        AND (PhoneNumber IS NULL OR LTRIM(RTRIM(PhoneNumber)) = N'');

      SELECT @@ROWCOUNT AS Updated;
    `);

  return (res.recordset[0]?.Updated ?? 0) > 0;
}
