"use server";

import { getPool, sql } from "@/lib/db/sql";
import { calcCommissionFromTotal } from "@/lib/commission";

export type TrendRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "ALL";
export type TrendPoint = { period: string; revenue: number; commission: number };

function getSinceDays(range: TrendRange): number | null {
  switch (range) {
    case "1W":  return 7;
    case "1M":  return 30;
    case "3M":  return 90;
    case "6M":  return 180;
    case "1Y":  return 365;
    case "2Y":  return 730;
    case "ALL": return null;
  }
}

function isDaily(range: TrendRange): boolean {
  return range === "1W" || range === "1M";
}

/**
 * Lấy trend cho nhiều partner đồng thời rồi cộng dồn theo period.
 * Dùng cho trang Hiệu suất admin — chỉ active partners.
 */
export async function getTrendSeriesForPartners(
  partnerIds: number[],
  range: TrendRange,
): Promise<TrendPoint[]> {
  if (partnerIds.length === 0) return [];

  const series = await Promise.all(
    partnerIds.map((id) => getTrendSeries(id, range)),
  );

  // Gộp tất cả điểm theo period, cộng revenue + commission
  const merged = new Map<string, TrendPoint>();
  for (const points of series) {
    for (const p of points) {
      const existing = merged.get(p.period);
      if (existing) {
        existing.revenue += p.revenue;
        existing.commission += p.commission;
      } else {
        merged.set(p.period, { ...p });
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.period.localeCompare(b.period),
  );
}

export async function getTrendSeries(
  partnerId: string | number | null,
  range: TrendRange,
): Promise<TrendPoint[]> {
  try {
    const numPartnerId =
      partnerId !== null && partnerId !== undefined
        ? typeof partnerId === "string"
          ? parseInt(partnerId, 10)
          : partnerId
        : null;

    const validPartnerId = numPartnerId !== null && !isNaN(numPartnerId) ? numPartnerId : null;

    const days = getSinceDays(range);
    const since = days !== null ? new Date(Date.now() - days * 86_400_000) : null;

    const pool = await getPool();

    type TrendRow = { Period: string; Revenue: number };
    const res = await pool
      .request()
      .input("PartnerId", sql.Int,      validPartnerId)
      .input("Since",     sql.DateTime, since)
      .input("IsDaily",   sql.Bit,      isDaily(range) ? 1 : 0)
      .execute<TrendRow>("usp_GetTrendSeries");

    return res.recordset.map((r) => ({
      period: r.Period,
      revenue: r.Revenue,
      commission: calcCommissionFromTotal(r.Revenue),
    }));
  } catch (err) {
    console.error("[getTrendSeries]", err);
    return [];
  }
}
