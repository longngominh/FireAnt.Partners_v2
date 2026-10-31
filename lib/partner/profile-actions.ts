"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getPool, sql } from "@/lib/db/sql";
import { hasStaffModel, STAFF_MIGRATION_HINT } from "@/lib/data/staff-model";
import { normalizeTaxCode, TAX_CODE_INVALID_MESSAGE } from "@/lib/partner/tax-code";

export type ProfileActionState = { ok: boolean; message?: string; error?: string };

/** Đối tác tự cập nhật mã số thuế (10 hoặc 13 chữ số, có thể có dấu gạch như 0101234567-001). */
export async function updateTaxCodeAction(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang." };
  if (session.user.role === "staff" || session.user.role === "applicant") {
    return { ok: false, error: "Chỉ đối tác đứng tên hợp đồng mới cập nhật mã số thuế." };
  }
  const partnerId = Number(session.user.partnerId);
  if (!Number.isInteger(partnerId)) return { ok: false, error: "Không xác định được đối tác." };
  if (!(await hasStaffModel())) return { ok: false, error: STAFF_MIGRATION_HINT };

  const raw = normalizeTaxCode(String(formData.get("taxCode") ?? ""));
  if (!raw) return { ok: false, error: TAX_CODE_INVALID_MESSAGE };
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .input("TaxCode", sql.NVarChar(20), raw)
      .query("UPDATE Partners SET TaxCode = @TaxCode WHERE PartnerId = @PartnerId;");
    revalidatePath("/profile");
    revalidatePath("/dashboard");
    return { ok: true, message: "Đã lưu mã số thuế. FireAnt dùng thông tin này cho kỳ chi trả tới." };
  } catch (err) {
    console.error("[updateTaxCodeAction]", err);
    return { ok: false, error: "Không lưu được. Vui lòng thử lại." };
  }
}
