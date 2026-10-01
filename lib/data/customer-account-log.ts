import { getPool, sql } from "@/lib/db/sql";

/**
 * Nhật ký các lần Partners ghi vào TÀI KHOẢN FireAnt của khách (bảng CustomerAccountLog,
 * db/migrations/add-customer-phone-and-account-log.sql):
 *   CREATE_ACCOUNT — CTV tạo tài khoản hộ khách
 *   FILL_PHONE     — điền số điện thoại cho tài khoản chưa có số
 * Để truy được ai đã tạo/sửa, và giới hạn số tài khoản một người tạo trong 24 giờ.
 */
export type CustomerAccountAction = "CREATE_ACCOUNT" | "FILL_PHONE";

export async function logCustomerAccountAction(entry: {
  action: CustomerAccountAction;
  partnerId: string | number | null;
  createdBy: string;
  userName: string;
  phoneNumber: string | null;
  succeeded: boolean;
  note?: string | null;
}): Promise<void> {
  const numPartnerId =
    entry.partnerId === null ? null : typeof entry.partnerId === "string" ? parseInt(entry.partnerId, 10) : entry.partnerId;

  const pool = await getPool();
  await pool
    .request()
    .input("Action", sql.NVarChar(20), entry.action)
    .input("PartnerId", sql.Int, numPartnerId !== null && !isNaN(numPartnerId) ? numPartnerId : null)
    .input("CreatedBy", sql.NVarChar(256), entry.createdBy)
    .input("UserName", sql.NVarChar(256), entry.userName)
    .input("PhoneNumber", sql.NVarChar(20), entry.phoneNumber)
    .input("Succeeded", sql.Bit, entry.succeeded)
    .input("Note", sql.NVarChar(500), entry.note?.slice(0, 500) ?? null)
    .query(`
      INSERT INTO CustomerAccountLog (Action, PartnerId, CreatedBy, UserName, PhoneNumber, Succeeded, Note)
      VALUES (@Action, @PartnerId, @CreatedBy, @UserName, @PhoneNumber, @Succeeded, @Note);
    `);
}

/** Số tài khoản người này đã tạo hộ thành công trong @hours giờ qua. */
export async function countAccountsCreatedBy(createdBy: string, hours = 24): Promise<number> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("CreatedBy", sql.NVarChar(256), createdBy)
    .input("Hours", sql.Int, hours)
    .query<{ Total: number }>(`
      SELECT COUNT(*) AS Total
      FROM CustomerAccountLog
      WHERE Action = N'CREATE_ACCOUNT'
        AND Succeeded = 1
        AND CreatedBy = @CreatedBy
        AND CreatedDate >= DATEADD(hour, -@Hours, GETDATE());
    `);
  return res.recordset[0]?.Total ?? 0;
}
