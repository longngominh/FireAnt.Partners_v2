import {
  calcTierPayout,
  explainCommission,
  FIXED_SALARY,
  FLAT_RATE,
  FLAT_RATE_THRESHOLD,
  TIER_LABELS,
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

export function explainRemuneration(r: RemunerationBreakdown): ExplainLine[] {
  if (r.policy === "tier" && r.tier) {
    const payout = calcTierPayout(r.tier, r.revenue);
    return payout.lines.map((line) => {
      if (line.kind === "base") return { label: `${n(line.base)} × ${pct(line.rate)}`, amount: line.amount };
      if (line.kind === "bonus") {
        return {
          label: `Thưởng hạng ${TIER_LABELS[payout.tier]}: ${n(line.base)} × ${pct(line.rate)}`,
          amount: line.amount,
        };
      }
      return {
        label: line.from > 0 ? `Phần vượt ${n(line.from)}: ${n(line.base)} × ${pct(line.rate)}` : `${n(line.base)} × ${pct(line.rate)}`,
        amount: line.amount,
      };
    });
  }

  if (r.revenue >= FLAT_RATE_THRESHOLD) {
    const lines: ExplainLine[] = [
      { label: `Từ ${n(FLAT_RATE_THRESHOLD)} trở lên: ${n(r.revenue)} × ${pct(FLAT_RATE)}`, amount: Math.floor(r.revenue * FLAT_RATE) },
    ];
    if (FIXED_SALARY[r.partnerType] > 0) {
      lines.push({ label: "Trừ lương cứng (trả qua bảng lương)", amount: -FIXED_SALARY[r.partnerType] });
    }
    return lines;
  }

  const parts = explainCommission(r.revenue, r.partnerType).filter((p) => p.rate > 0);
  let allocated = 0;
  return parts.map((part, index) => {
    const isLast = index === parts.length - 1;
    const amount = isLast ? r.commission - allocated : Math.floor(part.commission);
    allocated += amount;
    return { label: `Bậc ${n(part.from)}–${Number.isFinite(part.to) ? n(part.to) : "…"}: ${n(part.amount)} × ${pct(part.rate)}`, amount };
  });
}

/** Số tiền trả qua giấy đề nghị thanh toán (không gồm lương cứng NVKD). */
export function payableAmount(r: RemunerationBreakdown): number {
  return r.commission + r.performanceBonus;
}
