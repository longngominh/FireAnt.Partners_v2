/**
 * Commission/remuneration engine — bậc theo file Excel lương NVKD và hoa hồng đại lý.
 *
 * Rules:
 *   - Incremental: từng phần doanh số tính theo band tương ứng.
 *   - Monthly reset: tích lũy reset về 0 đầu mỗi tháng.
 *   - Từ 09/2026 KHÔNG còn thưởng bán tốt riêng cho cả hai loại — mức thưởng cũ
 *     đã gộp vào tỷ lệ bậc (NVKD: 90tr+ nhảy lên 16,5%…23%; CTV: 130tr+ lên 19,5%…27%).
 *   - sales_employee: có lương cứng công ty (trả qua bảng lương) + hoa hồng theo bậc.
 *   - collaborator: không có lương cứng, chỉ hoa hồng theo bậc.
 *   - Cả hai loại: doanh số từ 250tr trở lên thì tổng thu nhập tháng = 18% doanh số
 *     (NVKD: hoa hồng thực nhận = 18% doanh số − lương cứng 6tr).
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

// Bảng NVKD đã gộp thưởng bán tốt vào tỷ lệ: từ bậc 90tr mỗi bậc cộng thêm
// 5%, 5%, 6%, 6%, 7%, 7%, 8%, 8% tương ứng mức thưởng cũ chia cho độ rộng bậc 20tr.
// Bậc cuối để mở (Infinity) cho các phép tính lũy tiến theo đơn; riêng thu nhập
// tháng khi doanh số >= FLAT_RATE_THRESHOLD được calcMonthlyRemuneration ghi đè = 18%.
export const SALES_EMPLOYEE_COMMISSION_BANDS: readonly CommissionBand[] = [
  { from: 0,           to: 30_000_000,  rate: 0 },
  { from: 30_000_000,  to: 50_000_000,  rate: 0.10 },
  { from: 50_000_000,  to: 70_000_000,  rate: 0.105 },
  { from: 70_000_000,  to: 90_000_000,  rate: 0.11 },
  { from: 90_000_000,  to: 110_000_000, rate: 0.165 },
  { from: 110_000_000, to: 130_000_000, rate: 0.17 },
  { from: 130_000_000, to: 150_000_000, rate: 0.185 },
  { from: 150_000_000, to: 170_000_000, rate: 0.19 },
  { from: 170_000_000, to: 190_000_000, rate: 0.205 },
  { from: 190_000_000, to: 210_000_000, rate: 0.21 },
  { from: 210_000_000, to: 230_000_000, rate: 0.225 },
  { from: 230_000_000, to: Infinity,    rate: 0.23 },
] as const;

// Bảng CTV đã gộp thưởng bán tốt vào tỷ lệ: từ bậc 130tr mỗi bậc cộng thêm
// 5%, 6%, 7%… tương ứng mức thưởng cũ chia cho độ rộng bậc 20tr. Bậc cuối để
// mở (Infinity) cho các phép tính lũy tiến theo đơn; riêng thu nhập tháng
// khi doanh số > FLAT_RATE_THRESHOLD được calcMonthlyRemuneration ghi đè = 18%.
export const COLLABORATOR_COMMISSION_BANDS: readonly CommissionBand[] = [
  { from: 0,           to: 30_000_000,  rate: 0.12 },
  { from: 30_000_000,  to: 50_000_000,  rate: 0.12 },
  { from: 50_000_000,  to: 70_000_000,  rate: 0.125 },
  { from: 70_000_000,  to: 90_000_000,  rate: 0.13 },
  { from: 90_000_000,  to: 110_000_000, rate: 0.135 },
  { from: 110_000_000, to: 130_000_000, rate: 0.14 },
  { from: 130_000_000, to: 150_000_000, rate: 0.195 },
  { from: 150_000_000, to: 170_000_000, rate: 0.21 },
  { from: 170_000_000, to: 190_000_000, rate: 0.225 },
  { from: 190_000_000, to: 210_000_000, rate: 0.24 },
  { from: 210_000_000, to: 230_000_000, rate: 0.255 },
  { from: 230_000_000, to: Infinity,    rate: 0.27 },
] as const;

// Backward-compatible alias for existing imports.
export const COMMISSION_BANDS = SALES_EMPLOYEE_COMMISSION_BANDS;

export const FIXED_SALARY: Record<PartnerType, number> = {
  sales_employee: 6_000_000,
  collaborator: 0,
};

/** Doanh số từ mốc này trở lên thì tổng thu nhập tháng cố định = 18% doanh số. */
export const FLAT_RATE_THRESHOLD = 250_000_000;
export const FLAT_RATE = 0.18;

export type PerformanceBonusTier = { revenue: number; bonus: number };

export const PERFORMANCE_BONUSES: Record<PartnerType, PerformanceBonusTier[]> = {
  // Từ 09/2026 không loại nào có thưởng riêng — đã gộp vào *_COMMISSION_BANDS.
  // Giữ cấu trúc để performanceBonus trong RemunerationBreakdown vẫn = 0 thay vì
  // phải sửa mọi nơi hiển thị, và để bật lại được nếu chính sách đổi.
  sales_employee: [],
  collaborator: [],
};

/** Loại partner có chế độ thưởng bán tốt tách riêng khỏi hoa hồng. */
export function hasPerformanceBonus(partnerType: PartnerType): boolean {
  return PERFORMANCE_BONUSES[normalizePartnerType(partnerType)].length > 0;
}

export function normalizePartnerType(value: unknown): PartnerType {
  return value === "sales_employee" ? "sales_employee" : "collaborator";
}

export function getBands(partnerType: PartnerType): readonly CommissionBand[] {
  return partnerType === "sales_employee"
    ? SALES_EMPLOYEE_COMMISSION_BANDS
    : COLLABORATOR_COMMISSION_BANDS;
}

export type CommissionBandBreakdown = CommissionBand & {
  /** Phần doanh số tháng rơi vào bậc này. */
  amount: number;
  /** Hoa hồng của riêng phần doanh số đó (chưa làm tròn). */
  commission: number;
};

/**
 * Phân rã doanh số tháng theo từng bậc — dùng để giải thích con số hoa hồng
 * trên giấy đề nghị thanh toán. Chỉ trả về các bậc có doanh số > 0.
 * Σ commission (làm tròn xuống) = calcCommissionFromTotal.
 */
export function explainCommission(
  monthlyRevenue: number,
  partnerType: PartnerType,
): CommissionBandBreakdown[] {
  const revenue = Math.max(0, monthlyRevenue);
  const parts: CommissionBandBreakdown[] = [];
  for (const band of getBands(partnerType)) {
    if (revenue <= band.from) break;
    const amount = Math.min(revenue, band.to) - band.from;
    parts.push({ ...band, amount, commission: amount * band.rate });
  }
  return parts;
}

/** Mốc thưởng đã đạt (cao nhất) và mốc kế tiếp chưa đạt, để giải thích cột Thưởng. */
export function explainPerformanceBonus(
  monthlyRevenue: number,
  partnerType: PartnerType,
): { reached: PerformanceBonusTier | null; next: PerformanceBonusTier | null } {
  const tiers = PERFORMANCE_BONUSES[normalizePartnerType(partnerType)];
  let reached: PerformanceBonusTier | null = null;
  let next: PerformanceBonusTier | null = null;
  for (const tier of tiers) {
    if (monthlyRevenue >= tier.revenue) reached = tier;
    else if (!next) next = tier;
  }
  return { reached, next };
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

  // Quy chế ghi "từ 250.000.000 VNĐ trở lên" → so sánh >=.
  if (revenue >= FLAT_RATE_THRESHOLD) {
    const total = Math.floor(revenue * FLAT_RATE);
    const baseSalary = FIXED_SALARY[normalizedType];
    // Có chế độ thưởng: hoa hồng vẫn theo bậc, phần còn lại của 18% là thưởng.
    // Không có thưởng (hiện tại cả hai loại): 18% doanh số − lương cứng là hoa hồng.
    const commission = hasPerformanceBonus(normalizedType)
      ? calcCommissionFromTotal(revenue, normalizedType)
      : Math.max(0, total - baseSalary);
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
