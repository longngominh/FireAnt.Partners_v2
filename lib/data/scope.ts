import { hasStaffModel } from "@/lib/data/staff-model";

/**
 * Tham số @PartnerId / @TeamOf cho các proc danh sách (link, khách, đơn chờ tài khoản).
 * teamOf = đối tác: gồm cả dữ liệu của nhân viên trong thời gian được ghi nhận. Khi CSDL
 * chưa có migration nhân viên (proc chưa có @TeamOf) thì chỉ lọc theo chính đối tác.
 */
export async function listScope(
  partnerId: number | null,
  teamOf: number | null | undefined,
): Promise<{ partnerId: number | null; teamOf: number | null }> {
  if (teamOf === null || teamOf === undefined) return { partnerId, teamOf: null };
  if (await hasStaffModel()) return { partnerId: null, teamOf };
  return { partnerId: teamOf, teamOf: null };
}
