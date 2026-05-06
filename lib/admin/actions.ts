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
      .input("partnerId", sql.Int, partnerId)
      .input("isActive", sql.Bit, isActive ? 1 : 0)
      .query("UPDATE Partners SET IsActive = @isActive WHERE PartnerId = @partnerId");

    revalidatePath("/admin/partners");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lỗi không xác định." };
  }
}
