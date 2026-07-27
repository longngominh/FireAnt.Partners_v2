import { getPool, sql } from "@/lib/db/sql";

export type PartnerPaymentInfo = {
  fullName: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
};

export const EMPTY_PAYMENT_INFO: PartnerPaymentInfo = {
  fullName: null,
  bankAccountNumber: null,
  bankName: null,
};

/** Thiếu 3 cột này nghĩa là chưa chạy db/migrations/add-partner-payment-info.sql. */
export const PAYMENT_INFO_MIGRATION_HINT =
  "Chưa có cột thông tin chi trả trong bảng Partners. Hãy chạy db/migrations/add-partner-payment-info.sql trên SQL Server.";

export function isMissingPaymentColumns(err: unknown): boolean {
  return err instanceof Error && /Invalid column name/i.test(err.message);
}

type Row = {
  PartnerId: number;
  FullName: string | null;
  BankAccountNumber: string | null;
  BankName: string | null;
};

const SELECT_SQL = `
  SELECT PartnerId, FullName, BankAccountNumber, BankName
  FROM Partners
  WHERE (@PartnerId IS NULL OR PartnerId = @PartnerId);
`;

function mapRow(r: Row): PartnerPaymentInfo {
  return {
    fullName: r.FullName?.trim() || null,
    bankAccountNumber: r.BankAccountNumber?.trim() || null,
    bankName: r.BankName?.trim() || null,
  };
}

/**
 * Đọc tách riêng khỏi các stored procedure sẵn có để trang cộng tác viên và
 * bảng kê doanh thu vẫn chạy bình thường khi migration chưa được áp dụng.
 */
export async function getPartnerPaymentInfoMap(
  partnerId: number | null = null,
): Promise<Map<number, PartnerPaymentInfo>> {
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .query<Row>(SELECT_SQL);

    return new Map(res.recordset.map((r) => [r.PartnerId, mapRow(r)]));
  } catch (err) {
    if (isMissingPaymentColumns(err)) {
      console.warn("[getPartnerPaymentInfoMap]", PAYMENT_INFO_MIGRATION_HINT);
    } else {
      console.error("[getPartnerPaymentInfoMap]", err);
    }
    return new Map();
  }
}

export async function getPartnerPaymentInfo(partnerId: number): Promise<PartnerPaymentInfo> {
  const map = await getPartnerPaymentInfoMap(partnerId);
  return map.get(partnerId) ?? EMPTY_PAYMENT_INFO;
}
