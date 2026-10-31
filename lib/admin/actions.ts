"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isPartnerStaffType, normalizePartnerType } from "@/lib/commission";
import {
  isMissingPaymentColumns,
  PAYMENT_INFO_MIGRATION_HINT,
} from "@/lib/data/partner-payment-info";
import { STAFF_MIGRATION_HINT } from "@/lib/data/staff-model";
import { getPool, sql } from "@/lib/db/sql";
import { normalizeTaxCode, TAX_CODE_INVALID_MESSAGE } from "@/lib/partner/tax-code";

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

function getFormNullableString(formData: FormData, key: string): string | null {
  return getFormString(formData, key) || null;
}

function describeError(err: unknown): string {
  if (isMissingPaymentColumns(err)) return PAYMENT_INFO_MIGRATION_HINT;
  return err instanceof Error ? err.message : "Lỗi không xác định.";
}

type LegalFields = { legalType: "individual" | "company"; taxCode: string | null };

/**
 * Loại đối tác (cá nhân/pháp nhân) và mã số thuế — chỉ có khi form hiện hai ô này (CSDL đã chạy
 * add-partner-staff-model.sql). Trả về chuỗi lỗi khi mã số thuế không hợp lệ.
 */
function readLegalFields(formData: FormData): LegalFields | string | null {
  if (formData.get("hasLegalFields") !== "1") return null;
  const legalType = getFormString(formData, "legalType") === "company" ? "company" : "individual";
  const rawTaxCode = getFormString(formData, "taxCode");
  if (!rawTaxCode) return { legalType, taxCode: null };
  const taxCode = normalizeTaxCode(rawTaxCode);
  return taxCode ? { legalType, taxCode } : TAX_CODE_INVALID_MESSAGE;
}

async function saveLegalFields(
  pool: Awaited<ReturnType<typeof getPool>>,
  username: string,
  fields: LegalFields,
): Promise<void> {
  try {
    await pool
      .request()
      .input("UserName", sql.NVarChar(256), username)
      .input("LegalType", sql.NVarChar(16), fields.legalType)
      .input("TaxCode", sql.NVarChar(20), fields.taxCode)
      .query(`
        UPDATE Partners SET LegalType = @LegalType, TaxCode = @TaxCode WHERE UserName = @UserName;
      `);
  } catch (err) {
    if (isMissingPaymentColumns(err)) throw new Error(STAFF_MIGRATION_HINT);
    throw err;
  }
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
  const fullName = getFormNullableString(formData, "fullName");
  const bankAccountNumber = getFormNullableString(formData, "bankAccountNumber");
  const bankName = getFormNullableString(formData, "bankName");
  const legal = readLegalFields(formData);

  if (!username) {
    return { ok: false, error: "Vui lòng nhập UserName của tài khoản IS4." };
  }
  if (typeof legal === "string") return { ok: false, error: legal };

  try {
    const pool = await getPool();
    if (!(await validateIdentityUser(pool, username))) {
      return { ok: false, error: "Không tìm thấy UserName này trên IdentityServer4." };
    }
    if (await isDuplicatePartnerUsername(pool, username)) {
      return {
        ok: false,
        error: "Tài khoản này đã có trong hệ thống (đối tác, NVKD hoặc nhân viên của một đối tác).",
      };
    }

    await pool
      .request()
      .input("UserName", sql.NVarChar(256), username)
      .input("PartnerType", sql.NVarChar(32), partnerType)
      .input("IsActive", sql.Bit, isActive ? 1 : 0)
      .input("FullName", sql.NVarChar(200), fullName)
      .input("BankAccountNumber", sql.NVarChar(50), bankAccountNumber)
      .input("BankName", sql.NVarChar(100), bankName)
      .query(`
        INSERT INTO Partners
          (UserName, PartnerType, IsActive, CreatedDate, FullName, BankAccountNumber, BankName)
        VALUES
          (@UserName, @PartnerType, @IsActive, GETDATE(), @FullName, @BankAccountNumber, @BankName);
      `);
    if (legal) await saveLegalFields(pool, username, legal);

    revalidatePath("/admin/partners");
    return { ok: true, message: "Đã thêm đối tác." };
  } catch (err) {
    return { ok: false, error: describeError(err) };
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
  const fullName = getFormNullableString(formData, "fullName");
  const bankAccountNumber = getFormNullableString(formData, "bankAccountNumber");
  const bankName = getFormNullableString(formData, "bankName");
  const legal = readLegalFields(formData);

  if (!username) {
    return { ok: false, error: "Vui lòng nhập UserName của tài khoản IS4." };
  }
  if (typeof legal === "string") return { ok: false, error: legal };

  try {
    const pool = await getPool();
    const current = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .query<{ PartnerType: string | null }>("SELECT PartnerType FROM Partners WHERE PartnerId = @PartnerId;");
    if (isPartnerStaffType(current.recordset[0]?.PartnerType)) {
      return { ok: false, error: "Đây là nhân viên của một đối tác — quản lý ở hồ sơ đối tác đó." };
    }
    if (!(await validateIdentityUser(pool, username))) {
      return { ok: false, error: "Không tìm thấy UserName này trên IdentityServer4." };
    }
    if (await isDuplicatePartnerUsername(pool, username, partnerId)) {
      return {
        ok: false,
        error: "Tài khoản này đã có trong hệ thống (đối tác, NVKD hoặc nhân viên của một đối tác).",
      };
    }

    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .input("UserName", sql.NVarChar(256), username)
      .input("PartnerType", sql.NVarChar(32), partnerType)
      .input("IsActive", sql.Bit, isActive ? 1 : 0)
      .input("FullName", sql.NVarChar(200), fullName)
      .input("BankAccountNumber", sql.NVarChar(50), bankAccountNumber)
      .input("BankName", sql.NVarChar(100), bankName)
      .query(`
        UPDATE Partners
        SET UserName = @UserName,
            PartnerType = @PartnerType,
            IsActive = @IsActive,
            FullName = @FullName,
            BankAccountNumber = @BankAccountNumber,
            BankName = @BankName
        WHERE PartnerId = @PartnerId;
      `);

    if ((res.rowsAffected[0] ?? 0) === 0) {
      return { ok: false, error: "Không tìm thấy đối tác." };
    }
    if (legal) await saveLegalFields(pool, username, legal);

    revalidatePath("/admin/partners");
    revalidatePath(`/admin/partners/${partnerId}`);
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Đã cập nhật đối tác." };
  } catch (err) {
    return { ok: false, error: describeError(err) };
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
