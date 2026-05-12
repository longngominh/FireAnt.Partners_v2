"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getPool, sql } from "@/lib/db/sql";

export async function togglePartnerActiveAction(
  partnerId: number,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { ok: false, error: "Không có quyền." };
  }

  try {
    const pool = await getPool();
    await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .input("IsActive",  sql.Bit, isActive ? 1 : 0)
      .execute("usp_TogglePartnerActive");

    revalidatePath("/admin/partners");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lỗi không xác định." };
  }
}
