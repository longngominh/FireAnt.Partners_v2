import { getPool, sql } from "@/lib/db/sql";

export type FireAntUser = {
  userName: string;
  email: string | null;
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
    .query<{ UserName: string; Email: string | null }>(`
      SELECT TOP 1 UserName, Email
      FROM NEWFA.FireAnt_Identity.dbo.AspNetUsers
      WHERE UserName = @Value OR Email = @Value;
    `);

  const row = res.recordset[0];
  if (!row?.UserName) return null;

  return { userName: row.UserName, email: row.Email ?? null };
}
