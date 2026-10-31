import { getPool } from "@/lib/db/sql";

/**
 * Mô hình đối tác – nhân viên + phụ lục cần db/migrations/add-partner-staff-model.sql.
 * Code vẫn chạy khi chưa chạy migration: mọi đối tác tính theo chính sách Thường, không có
 * doanh số nhân viên, các trang nhân viên/duyệt hiện STAFF_MIGRATION_HINT.
 */

export const STAFF_MIGRATION_HINT =
  "CSDL chưa có bảng nhân viên và phụ lục. Hãy chạy db/migrations/add-partner-staff-model.sql rồi db/all-stored-procedures.sql trên SQL Server.";

const CACHE_MS = 60_000;
let cached: { ready: boolean; at: number } | null = null;

/** true khi đã có đủ PartnerContractTiers, PartnerStaffApplications, PartnerStaffMemberships. */
export async function hasStaffModel(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ready;
  try {
    const pool = await getPool();
    const res = await pool.request().query<{ Ready: number }>(`
      SELECT CASE
        WHEN OBJECT_ID(N'dbo.PartnerContractTiers', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.PartnerStaffApplications', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.PartnerStaffMemberships', N'U') IS NOT NULL
        THEN 1 ELSE 0 END AS Ready;
    `);
    const ready = res.recordset[0]?.Ready === 1;
    cached = { ready, at: Date.now() };
    return ready;
  } catch (err) {
    console.error("[hasStaffModel]", err);
    return false;
  }
}
