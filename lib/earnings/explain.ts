import {
  calcTierPayout,
  explainCommission,
  FIXED_SALARY,
  FLAT_RATE,
  FLAT_RATE_THRESHOLD,
  REPEAT_RATE,
  TIER_LABELS,
  type PartnerTier,
  type PartnerType,
  type RemunerationBreakdown,
} from "@/lib/commission";

/**
 * Diễn giải con số thù lao thành các dòng "căn cứ × tỷ lệ = số tiền" để CTV và kế toán
 * đối chiếu được — dùng chung cho cổng CTV và bảng quản trị.
 */

export type ExplainLine = { label: string; amount: number; emphasis?: boolean };

const NUMBER = new Intl.NumberFormat("vi-VN");

function n(value: number): string {
  return NUMBER.format(Math.round(value));
}

function pct(rate: number): string {
  return `${(rate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

/** Các dòng của biểu phụ lục trên `revenue` (Σ = calcTierPayout(...).total). */
function tierLines(tier: PartnerTier, revenue: number, prefix = ""): ExplainLine[] {
  const payout = calcTierPayout(tier, revenue);
  return payout.lines.map((line) => {
    if (line.kind === "base") return { label: `${prefix}${n(line.base)} × ${pct(line.rate)}`, amount: line.amount };
    if (line.kind === "bonus") {
      return {
        label: `${prefix}Thưởng hạng ${TIER_LABELS[payout.tier]}: ${n(line.base)} × ${pct(line.rate)}`,
        amount: line.amount,
      };
    }
    return {
      label:
        line.from > 0
          ? `${prefix}Phần vượt ${n(line.from)}: ${n(line.base)} × ${pct(line.rate)}`
          : `${prefix}${n(line.base)} × ${pct(line.rate)}`,
      amount: line.amount,
    };
  });
}

/** Các dòng bậc lũy tiến trên `revenue`; bậc cuối nhận phần dư để Σ = `commission`. */
function bandLines(revenue: number, partnerType: PartnerType, commission: number, prefix = ""): ExplainLine[] {
  if (revenue >= FLAT_RATE_THRESHOLD) {
    const lines: ExplainLine[] = [
      {
        label: `${prefix}Từ ${n(FLAT_RATE_THRESHOLD)} trở lên: ${n(revenue)} × ${pct(FLAT_RATE)}`,
        amount: Math.floor(revenue * FLAT_RATE),
      },
    ];
    if (FIXED_SALARY[partnerType] > 0) {
      lines.push({ label: "Trừ lương cứng (trả qua bảng lương)", amount: -FIXED_SALARY[partnerType] });
    }
    return lines;
  }

  const parts = explainCommission(revenue, partnerType).filter((p) => p.rate > 0);
  let allocated = 0;
  return parts.map((part, index) => {
    const isLast = index === parts.length - 1;
    const amount = isLast ? commission - allocated : Math.floor(part.commission);
    allocated += amount;
    return {
      label: `${prefix}Bậc ${n(part.from)}–${Number.isFinite(part.to) ? n(part.to) : "…"}: ${n(part.amount)} × ${pct(part.rate)}`,
      amount,
    };
  });
}

export function explainRemuneration(r: RemunerationBreakdown): ExplainLine[] {
  if (r.policy === "split" && r.split) {
    const { newRevenue, newCommission, repeatRevenue, repeatCommission } = r.split;
    const lines: ExplainLine[] =
      newRevenue <= 0
        ? []
        : r.tier
          ? tierLines(r.tier, newRevenue, "Khách mới · ")
          : bandLines(newRevenue, r.partnerType, newCommission, "Khách mới · ");
    if (repeatRevenue > 0) {
      lines.push({
        label: `Gia hạn, nâng cấp · ${n(repeatRevenue)} × ${pct(REPEAT_RATE)}`,
        amount: repeatCommission,
      });
    }
    return lines;
  }
  if (r.policy === "tier" && r.tier) return tierLines(r.tier, r.revenue);
  return bandLines(r.revenue, r.partnerType, r.commission);
}

/** Số tiền trả qua giấy đề nghị thanh toán (không gồm lương cứng NVKD). */
export function payableAmount(r: RemunerationBreakdown): number {
  return r.commission + r.performanceBonus;
}
