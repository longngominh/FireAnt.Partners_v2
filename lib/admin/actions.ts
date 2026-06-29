"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { normalizePartnerType } from "@/lib/commission";
import { getPool, sql } from "@/lib/db/sql";

export type PartnerFormState = {
  ok: boolean;
  message?: string;
  error?: string;
};

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getFormBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { ok: false, error: "Không có quyền." };
  }

  return { ok: true };
}

async function validateIdentityUser(pool: Awaited<ReturnType<typeof getPool>>, username: string) {
  const res = await pool
    .request()
    .input("UserName", sql.NVarChar(256), username)
    .query<{ UserName: string }>(`
      SELECT TOP 1 UserName
      FROM NEWFA.FireAnt_Identity.dbo.AspNetUsers
      WHERE UserName = @UserName;
    `);

  return Boolean(res.recordset[0]);
}

async function isDuplicatePartnerUsername(
  pool: Awaited<ReturnType<typeof getPool>>,
  username: string,
  partnerId?: number,
) {
  const res = await pool
    .request()
    .input("UserName", sql.NVarChar(256), username)
    .input("PartnerId", sql.Int, partnerId ?? null)
    .query<{ Count: number }>(`
      SELECT COUNT(*) AS Count
      FROM Partners
      WHERE UserName = @UserName
        AND (@PartnerId IS NULL OR PartnerId <> @PartnerId);
    `);

  return (res.recordset[0]?.Count ?? 0) > 0;
}

export async function togglePartnerActiveAction(
  partnerId: number,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

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

export async function createPartnerAction(
  _prevState: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

  const username = getFormString(formData, "username");
  const partnerType = normalizePartnerType(getFormString(formData, "partnerType"));
  const isActive = getFormBoolean(formData, "isActive");

  if (!username) {
    return { ok: false, error: "Vui lòng nhập UserName của tài khoản IS4." };
  }

  try {
    const pool = await getPool();
    if (!(await validateIdentityUser(pool, username))) {
      return { ok: false, error: "Không tìm thấy UserName này trên IdentityServer4." };
    }
    if (await isDuplicatePartnerUsername(pool, username)) {
      return { ok: false, error: "UserName này đã được gán cho một cộng tác viên khác." };
    }

    await pool
      .request()
      .input("UserName", sql.NVarChar(256), username)
      .input("PartnerType", sql.NVarChar(32), partnerType)
      .input("IsActive", sql.Bit, isActive ? 1 : 0)
      .query(`
        INSERT INTO Partners (UserName, PartnerType, IsActive, CreatedDate)
        VALUES (@UserName, @PartnerType, @IsActive, GETDATE());
      `);

    revalidatePath("/admin/partners");
    return { ok: true, message: "Đã thêm cộng tác viên." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lỗi không xác định." };
  }
}

export async function updatePartnerAction(
  partnerId: number,
  _prevState: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

  const username = getFormString(formData, "username");
  const partnerType = normalizePartnerType(getFormString(formData, "partnerType"));
  const isActive = getFormBoolean(formData, "isActive");

  if (!username) {
    return { ok: false, error: "Vui lòng nhập UserName của tài khoản IS4." };
  }

  try {
    const pool = await getPool();
    if (!(await validateIdentityUser(pool, username))) {
      return { ok: false, error: "Không tìm thấy UserName này trên IdentityServer4." };
    }
    if (await isDuplicatePartnerUsername(pool, username, partnerId)) {
      return { ok: false, error: "UserName này đã được gán cho một cộng tác viên khác." };
    }

    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .input("UserName", sql.NVarChar(256), username)
      .input("PartnerType", sql.NVarChar(32), partnerType)
      .input("IsActive", sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE Partners
        SET UserName = @UserName,
            PartnerType = @PartnerType,
            IsActive = @IsActive
        WHERE PartnerId = @PartnerId;
      `);

    if ((res.rowsAffected[0] ?? 0) === 0) {
      return { ok: false, error: "Không tìm thấy cộng tác viên." };
    }

    revalidatePath("/admin/partners");
    revalidatePath(`/admin/partners/${partnerId}`);
    return { ok: true, message: "Đã cập nhật cộng tác viên." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lỗi không xác định." };
  }
}

export async function deletePartnerAction(
  partnerId: number,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

  try {
    const pool = await getPool();
    await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .query(`
        UPDATE Partners
        SET IsActive = 0
        WHERE PartnerId = @PartnerId;
      `);

    revalidatePath("/admin/partners");
    revalidatePath(`/admin/partners/${partnerId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lỗi không xác định." };
  }
}
