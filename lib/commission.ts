/**
 * Commission/remuneration engine — bậc theo file Excel lương NVKD và hoa hồng đại lý.
 *
 * Rules:
 *   - Incremental: từng phần doanh số tính theo band tương ứng.
 *   - Monthly reset: tích lũy reset về 0 đầu mỗi tháng.
 *   - sales_employee: có lương cứng công ty + hoa hồng + thưởng bán tốt.
 *   - collaborator: không có lương cứng, thu nhập từ hoa hồng + thưởng bán tốt.
 */

export const PARTNER_TYPES = ["sales_employee", "collaborator"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  sales_employee: "Nhân viên kinh doanh",
  collaborator: "Cộng tác viên",
};

export type CommissionBand = {
  from: number;
  to: number;
  rate: number;
};

export type RemunerationBreakdown = {
  partnerType: PartnerType;
  revenue: number;
  baseSalary: number;
  commission: number;
  performanceBonus: number;
  total: number;
  effectiveRate: number;
};

export const SALES_EMPLOYEE_COMMISSION_BANDS: readonly CommissionBand[] = [
  { from: 0,           to: 30_000_000,  rate: 0 },
  { from: 30_000_000,  to: 50_000_000,  rate: 0.10 },
  { from: 50_000_000,  to: 70_000_000,  rate: 0.105 },
  { from: 70_000_000,  to: 90_000_000,  rate: 0.11 },
  { from: 90_000_000,  to: 110_000_000, rate: 0.115 },
  { from: 110_000_000, to: 130_000_000, rate: 0.12 },
  { from: 130_000_000, to: 150_000_000, rate: 0.125 },
  { from: 150_000_000, to: 170_000_000, rate: 0.13 },
  { from: 170_000_000, to: 190_000_000, rate: 0.135 },
  { from: 190_000_000, to: 210_000_000, rate: 0.14 },
  { from: 210_000_000, to: 230_000_000, rate: 0.145 },
  { from: 230_000_000, to: Infinity,    rate: 0.15 },
] as const;

export const COLLABORATOR_COMMISSION_BANDS: readonly CommissionBand[] = [
  { from: 0,           to: 30_000_000,  rate: 0.12 },
  { from: 30_000_000,  to: 50_000_000,  rate: 0.12 },
  { from: 50_000_000,  to: 70_000_000,  rate: 0.125 },
  { from: 70_000_000,  to: 90_000_000,  rate: 0.13 },
  { from: 90_000_000,  to: 110_000_000, rate: 0.135 },
  { from: 110_000_000, to: 130_000_000, rate: 0.14 },
  { from: 130_000_000, to: 150_000_000, rate: 0.145 },
  { from: 150_000_000, to: 170_000_000, rate: 0.15 },
  { from: 170_000_000, to: 190_000_000, rate: 0.155 },
  { from: 190_000_000, to: 210_000_000, rate: 0.16 },
  { from: 210_000_000, to: 230_000_000, rate: 0.165 },
  { from: 230_000_000, to: Infinity,    rate: 0.17 },
] as const;

// Backward-compatible alias for existing imports.
export const COMMISSION_BANDS = SALES_EMPLOYEE_COMMISSION_BANDS;

const FIXED_SALARY: Record<PartnerType, number> = {
  sales_employee: 6_000_000,
  collaborator: 0,
};

const PERFORMANCE_BONUSES: Record<PartnerType, Array<{ revenue: number; bonus: number }>> = {
  sales_employee: [
    { revenue: 110_000_000, bonus: 1_000_000 },
    { revenue: 130_000_000, bonus: 2_000_000 },
    { revenue: 150_000_000, bonus: 3_200_000 },
    { revenue: 170_000_000, bonus: 4_400_000 },
    { revenue: 190_000_000, bonus: 5_800_000 },
    { revenue: 210_000_000, bonus: 7_200_000 },
    { revenue: 230_000_000, bonus: 8_800_000 },
    { revenue: 250_000_000, bonus: 10_400_000 },
  ],
  collaborator: [
    { revenue: 150_000_000, bonus: 1_000_000 },
    { revenue: 170_000_000, bonus: 2_200_000 },
    { revenue: 190_000_000, bonus: 3_600_000 },
    { revenue: 210_000_000, bonus: 5_200_000 },
    { revenue: 230_000_000, bonus: 7_000_000 },
    { revenue: 250_000_000, bonus: 9_000_000 },
  ],
};

export function normalizePartnerType(value: unknown): PartnerType {
  return value === "sales_employee" ? "sales_employee" : "collaborator";
}

function getBands(partnerType: PartnerType): readonly CommissionBand[] {
  return partnerType === "sales_employee"
    ? SALES_EMPLOYEE_COMMISSION_BANDS
    : COLLABORATOR_COMMISSION_BANDS;
}

/**
 * Tính hoa hồng cho 1 đơn, biết trước đó trong tháng đã tích lũy bao nhiêu.
 *
 * priorRevenue : tổng doanh số TRƯỚC đơn này trong cùng tháng
 * orderAmount  : giá trị đơn này
 *
 * Tại sao nhận 2 args: mô hình prospective + incremental yêu cầu biết
 * vị trí tích lũy hiện tại để áp đúng band cho từng phần của đơn.
 */
export function calcOrderCommission(
  priorRevenue: number,
  orderAmount: number,
  partnerType: PartnerType = "sales_employee",
): number {
  if (orderAmount <= 0) return 0;
  let remaining = orderAmount;
  let cursor = priorRevenue;
  let commission = 0;

  for (const band of getBands(partnerType)) {
    if (cursor >= band.to) continue; // đã qua band này
    if (remaining <= 0) break;

    const effectiveStart = Math.max(cursor, band.from);
    const amountInBand = Math.min(remaining, band.to - effectiveStart);
    commission += amountInBand * band.rate;
    remaining -= amountInBand;
    cursor += amountInBand;
  }

  return Math.floor(commission);
}

/**
 * Tổng hoa hồng từ tổng doanh số tháng.
 *
 * Toán học: bracket cho tổng = Σ bracket(priorRevenue_i, amount_i) cho mọi order i
 * theo thứ tự thời gian — nhưng do các band không overlap, kết quả bằng nhau khi
 * chạy trên aggregate. Dùng cho chart lịch sử và dashboard tháng hiện tại.
 */
export function calcCommissionFromTotal(
  monthlyRevenue: number,
  partnerType: PartnerType = "sales_employee",
): number {
  return calcOrderCommission(0, monthlyRevenue, partnerType);
}

function getPerformanceBonus(revenue: number, partnerType: PartnerType): number {
  let bonus = 0;
  for (const tier of PERFORMANCE_BONUSES[partnerType]) {
    if (revenue >= tier.revenue) bonus = tier.bonus;
  }
  return bonus;
}

export function calcMonthlyRemuneration(
  monthlyRevenue: number,
  partnerType: PartnerType,
): RemunerationBreakdown {
  const normalizedType = normalizePartnerType(partnerType);
  const revenue = Math.max(0, monthlyRevenue);

  if (revenue > 250_000_000) {
    const total = Math.floor(revenue * 0.18);
    const baseSalary = FIXED_SALARY[normalizedType];
    const commission = calcCommissionFromTotal(revenue, normalizedType);
    return {
      partnerType: normalizedType,
      revenue,
      baseSalary,
      commission,
      performanceBonus: Math.max(0, total - baseSalary - commission),
      total,
      effectiveRate: revenue > 0 ? total / revenue : 0,
    };
  }

  const baseSalary = FIXED_SALARY[normalizedType];
  const commission = calcCommissionFromTotal(revenue, normalizedType);
  const performanceBonus = getPerformanceBonus(revenue, normalizedType);
  const total = baseSalary + commission + performanceBonus;

  return {
    partnerType: normalizedType,
    revenue,
    baseSalary,
    commission,
    performanceBonus,
    total,
    effectiveRate: revenue > 0 ? total / revenue : 0,
  };
}

/**
 * Rate hiệu lực hiện tại dựa trên doanh số tích lũy đã có.
 * Trả về rate của band tiếp theo sẽ được áp dụng.
 */
export function currentEffectiveRate(
  cumulativeRevenue: number,
  partnerType: PartnerType = "sales_employee",
): number {
  const band =
    [...getBands(partnerType)].reverse().find((b) => cumulativeRevenue >= b.from) ??
    getBands(partnerType)[0];
  return band.rate;
}

/** Start/end tháng hiện tại (local time). */
export function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}
