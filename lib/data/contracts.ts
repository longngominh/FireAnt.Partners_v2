import { isContractTier, type ContractTier } from "@/lib/commission";
import { getPool, sql } from "@/lib/db/sql";
import { hasStaffModel } from "@/lib/data/staff-model";
import { currentMonthKey, monthRange, toMonthKey, type MonthKey } from "@/lib/utils/month";

/**
 * Phụ lục hợp đồng của đối tác (PartnerContractTiers).
 *
 * Màn quản trị chỉ chọn phụ lục hiện tại; phụ lục luôn áp dụng cho cả tháng, tính từ ngày 01
 * của tháng lưu thay đổi. Mỗi lần đổi vẫn là một dòng mới để các tháng trước giữ đúng phụ lục
 * đã dùng: phụ lục của tháng M = dòng mới nhất có EffectiveMonth <= M. Không có dòng nào =
 * chính sách Thường.
 */

export type PartnerContract = {
  tier: ContractTier;
  /** Tháng bắt đầu áp dụng phụ lục đang hiệu lực; null = chưa từng chọn (Thường). */
  effectiveMonth: MonthKey | null;
  changedBy: string | null;
  changedAt: Date | null;
};

export const NORMAL_CONTRACT: PartnerContract = {
  tier: "normal",
  effectiveMonth: null,
  changedBy: null,
  changedAt: null,
};

type TierRow = {
  PartnerId: number;
  Tier: string;
  EffectiveMonth: Date;
  ChangedBy: string;
  ChangedDate: Date;
  ContractTierId: number;
};

function mapContract(row: TierRow): PartnerContract {
  return {
    tier: isContractTier(row.Tier) ? row.Tier : "normal",
    effectiveMonth: toMonthKey(row.EffectiveMonth),
    changedBy: row.ChangedBy,
    changedAt: row.ChangedDate,
  };
}

async function loadTierRows(until: MonthKey, partnerId: number | null): Promise<TierRow[]> {
  if (!(await hasStaffModel())) return [];
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("Until", sql.Date, monthRange(until).start)
      .input("PartnerId", sql.Int, partnerId)
      .query<TierRow>(`
        SELECT PartnerId, Tier, EffectiveMonth, ChangedBy, ChangedDate, ContractTierId
        FROM PartnerContractTiers
        WHERE EffectiveMonth <= @Until
          AND (@PartnerId IS NULL OR PartnerId = @PartnerId)
        ORDER BY PartnerId, EffectiveMonth, ContractTierId;
      `);
    return res.recordset;
  } catch (err) {
    console.error("[loadTierRows]", err);
    return [];
  }
}

/** Phụ lục áp dụng cho `month` của mọi đối tác (hoặc một đối tác). Đối tác vắng mặt = Thường. */
export async function getContractsForMonth(
  month: MonthKey,
  partnerId: number | null = null,
): Promise<Map<number, PartnerContract>> {
  const rows = await loadTierRows(month, partnerId);
  const result = new Map<number, PartnerContract>();
  // Sắp theo (EffectiveMonth, Id) tăng dần nên dòng sau ghi đè dòng trước.
  for (const row of rows) result.set(row.PartnerId, mapContract(row));
  return result;
}

/** Phụ lục đang hiệu lực (tháng hiện tại) của một đối tác. */
export async function getCurrentContract(partnerId: number): Promise<PartnerContract> {
  const map = await getContractsForMonth(currentMonthKey(), partnerId);
  return map.get(partnerId) ?? NORMAL_CONTRACT;
}

/**
 * Phụ lục từng tháng trong `months` (tăng dần) — cho bảng 6 tháng và lịch sử thù lao.
 * Kết quả: partnerId → (tháng → phụ lục); đối tác/tháng vắng mặt = Thường.
 */
export async function getContractTierHistory(
  months: MonthKey[],
  partnerId: number | null = null,
): Promise<Map<number, Map<MonthKey, ContractTier>>> {
  const result = new Map<number, Map<MonthKey, ContractTier>>();
  if (months.length === 0) return result;
  const rows = await loadTierRows(months[months.length - 1], partnerId);
  const byPartner = new Map<number, TierRow[]>();
  for (const row of rows) {
    const list = byPartner.get(row.PartnerId) ?? [];
    list.push(row);
    byPartner.set(row.PartnerId, list);
  }
  for (const [id, list] of byPartner) {
    const perMonth = new Map<MonthKey, ContractTier>();
    for (const month of months) {
      let tier: ContractTier = "normal";
      for (const row of list) {
        if (toMonthKey(row.EffectiveMonth) <= month && isContractTier(row.Tier)) tier = row.Tier;
      }
      perMonth.set(month, tier);
    }
    result.set(id, perMonth);
  }
  return result;
}

export function tierInMonth(
  history: Map<number, Map<MonthKey, ContractTier>>,
  partnerId: number,
  month: MonthKey,
): ContractTier {
  return history.get(partnerId)?.get(month) ?? "normal";
}

/**
 * Chọn phụ lục cho đối tác: áp dụng cho cả tháng hiện tại (từ ngày 01) và các tháng sau.
 * Tháng trước giữ phụ lục cũ vì phụ lục của tháng là dòng mới nhất có EffectiveMonth <= tháng.
 */
export async function setContractTier(params: {
  partnerId: number;
  tier: ContractTier;
  changedBy: string;
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("PartnerId", sql.Int, params.partnerId)
    .input("Tier", sql.NVarChar(16), params.tier)
    .input("ChangedBy", sql.NVarChar(256), params.changedBy)
    .query(`
      INSERT INTO PartnerContractTiers (PartnerId, Tier, EffectiveMonth, ChangedBy)
      VALUES (@PartnerId, @Tier, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1), @ChangedBy);
    `);
}
