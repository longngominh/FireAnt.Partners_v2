/**
 * Commission/remuneration engine.
 *
 * Đối tác (collaborator) từ SPLIT_POLICY_FROM: mọi hạng tính chung một cách theo loại đơn —
 * khách mua gói hội viên lần đầu theo biểu của hạng, gia hạn/nâng cấp REPEAT_RATE (xem
 * calcSplitRemuneration). Các tháng trước và NVKD giữ hai chế độ cũ:
 *   1. Phụ lục hợp đồng (chỉ collaborator đã ký phụ lục) — xem phần "Phụ lục hợp đồng"
 *      cuối file: biểu Bạc/Vàng/Kim cương trên doanh số KHÁCH MUA GÓI HỘI VIÊN LẦN ĐẦU.
 *   2. Bậc lũy tiến (NVKD luôn dùng; CTV chưa ký phụ lục = chính sách Thường)
 *      theo file Excel lương NVKD và hoa hồng đại lý:
 *   - Incremental: từng phần doanh số tính theo band tương ứng.
 *   - Monthly reset: tích lũy reset về 0 đầu mỗi tháng.
 *   - Từ 09/2026 KHÔNG còn thưởng bán tốt riêng cho cả hai loại — mức thưởng cũ
 *     đã gộp vào tỷ lệ bậc (NVKD: 90tr+ nhảy lên 16,5%…23%; CTV: 130tr+ lên 19,5%…27%).
 *   - sales_employee: có lương cứng công ty (trả qua bảng lương) + hoa hồng theo bậc.
 *   - collaborator: không có lương cứng, chỉ hoa hồng theo bậc.
 *   - Cả hai loại: doanh số từ 250tr trở lên thì tổng thu nhập tháng = 18% doanh số
 *     (NVKD: hoa hồng thực nhận = 18% doanh số − lương cứng 6tr).
 */

import { formatDay } from "@/lib/utils/month";

export const PARTNER_TYPES = ["sales_employee", "collaborator"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  sales_employee: "Nhân viên kinh doanh",
  collaborator: "Đối tác",
};

/**
 * Partners.PartnerType của nhân viên bán hàng thuộc một đối tác: có tài khoản và link riêng,
 * doanh số tính cho đối tác trong thời gian được ghi nhận, FireAnt không chi trả cho họ.
 * Không nằm trong PartnerType (chế độ thù lao) vì nhân viên không có chế độ nào.
 */
export const PARTNER_STAFF_TYPE = "partner_staff";

export function isPartnerStaffType(value: unknown): boolean {
  return value === PARTNER_STAFF_TYPE;
}

export type CommissionBand = {
  from: number;
  to: number;
  rate: number;
};

/**
 * "tier": biểu phụ lục trên DS khách mới; "legacy": bậc lũy tiến trên toàn bộ DS;
 * "split": đối tác từ SPLIT_POLICY_FROM — khách mới theo biểu của hạng + gia hạn/nâng cấp phẳng.
 */
export type RemunerationPolicy = "tier" | "legacy" | "split";

/** Hai phần của thù lao theo cách tính thống nhất (policy "split"). */
export type SplitRemuneration = {
  /** (a) Doanh số khách mua gói hội viên lần đầu — tính theo biểu của hạng. */
  newRevenue: number;
  newCommission: number;
  /** (b) gia hạn, (c) nâng cấp và gói khác — tính REPEAT_RATE, không cộng vào mốc. */
  repeatRevenue: number;
  repeatCommission: number;
};

export type RemunerationBreakdown = {
  partnerType: PartnerType;
  /**
   * Doanh số làm căn cứ tính: DS khách mới ("tier"), toàn bộ DS trừ khóa học ("legacy"),
   * hoặc khách mới + gia hạn/nâng cấp ("split").
   */
  revenue: number;
  baseSalary: number;
  commission: number;
  performanceBonus: number;
  total: number;
  effectiveRate: number;
  policy: RemunerationPolicy;
  /** Phụ lục áp dụng trong tháng — có khi policy = "tier", hoặc "split" với hạng Bạc/Vàng/Kim cương. */
  tier: PartnerTier | null;
  /** Chỉ có khi policy = "split". */
  split?: SplitRemuneration;
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
      policy: "legacy",
      tier: null,
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
    policy: "legacy",
    tier: null,
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

// ---------------------------------------------------------------------------
// Phụ lục hợp đồng — PLHĐ-FA-SILVER / GOLD / DIAMOND
// ---------------------------------------------------------------------------
//
// Hạng là phụ lục đối tác ĐÃ KÝ (FireAnt chọn ở hồ sơ đối tác), không tự lên theo doanh
// số. Chưa ký phụ lục = chính sách Thường = bậc lũy tiến CTV ở trên (toàn bộ doanh số).
//
// Có phụ lục: căn cứ tính là doanh số KHÁCH MUA GÓI HỘI VIÊN LẦN ĐẦU trong tháng (điểm a
// của phụ lục), gồm cả doanh số của nhân viên trong thời gian được ghi nhận. Trước
// SPLIT_POLICY_FROM gia hạn, nâng cấp chưa có biểu (điểm b, c) nên chưa tính thù lao; từ
// tháng đó mọi hạng tính gia hạn, nâng cấp REPEAT_RATE. Khóa học không thuộc phụ lục.
//
// Mỗi phụ lục có biểu đầy đủ cho mọi mức doanh số, đúng nguyên văn văn bản: Vàng và Kim
// cương không có "thưởng hạng" dưới mốc của mình, nên ở một số mức doanh số hạng cao trả
// ít hơn hạng thấp (vd 150tr: Bạc 25,5tr, Vàng 31,5tr, Kim cương 24tr).

export const PARTNER_TIERS = ["silver", "gold", "diamond"] as const;
export type PartnerTier = (typeof PARTNER_TIERS)[number];

/** Phụ lục áp dụng cho một tháng: "normal" = chưa ký phụ lục (chính sách Thường). */
export const CONTRACT_TIERS = ["normal", ...PARTNER_TIERS] as const;
export type ContractTier = (typeof CONTRACT_TIERS)[number];

export const TIER_LABELS: Record<PartnerTier, string> = {
  silver: "Bạc",
  gold: "Vàng",
  diamond: "Kim cương",
};

export const CONTRACT_TIER_LABELS: Record<ContractTier, string> = {
  normal: "Thường",
  ...TIER_LABELS,
};

export const TIER_APPENDIX: Record<PartnerTier, string> = {
  silver: "PLHĐ-FA-SILVER",
  gold: "PLHĐ-FA-GOLD",
  diamond: "PLHĐ-FA-DIAMOND",
};

export function isContractTier(value: unknown): value is ContractTier {
  return CONTRACT_TIERS.includes(value as ContractTier);
}

export function isPartnerTier(tier: ContractTier | null | undefined): tier is PartnerTier {
  return tier === "silver" || tier === "gold" || tier === "diamond";
}

/** "Hạng Vàng" / "Chính sách Thường" — tên dùng trên chip và tiêu đề. */
export function contractTierTitle(tier: ContractTier): string {
  return tier === "normal" ? "Chính sách Thường" : `Hạng ${TIER_LABELS[tier]}`;
}

/** "Phụ lục Vàng" / "Chính sách Thường" — tên dùng cạnh số tiền thù lao. */
export function contractTierScheme(tier: ContractTier): string {
  return tier === "normal" ? "Chính sách Thường" : `Phụ lục ${TIER_LABELS[tier]}`;
}

/**
 * Một đoạn của biểu: doanh số R (>= from) được tính
 *   baseAmount × baseRate + (R − from) × excessRate + R × bonusRate.
 * Đúng nguyên văn bảng "Cách tính thù lao" trong phụ lục.
 */
export type TierSegment = {
  from: number;
  baseAmount: number;
  baseRate: number;
  excessRate: number;
  bonusRate: number;
};

const UNDER_50: TierSegment = { from: 0, baseAmount: 0, baseRate: 0, excessRate: 0.12, bonusRate: 0 };
const FROM_50: TierSegment = { from: 50_000_000, baseAmount: 50_000_000, baseRate: 0.12, excessRate: 0.15, bonusRate: 0 };
const FROM_100: TierSegment = { from: 100_000_000, baseAmount: 100_000_000, baseRate: 0.15, excessRate: 0.18, bonusRate: 0 };

export const TIER_SCHEDULES: Record<PartnerTier, readonly TierSegment[]> = {
  // Bạc — dưới 50tr: 12%; từ 50tr: 50tr × 12% + vượt × 15% + 3% tổng (vd 80tr → 12,9tr).
  silver: [UNDER_50, { ...FROM_50, bonusRate: 0.03 }],
  // Vàng — từ 100tr: 100tr × 15% + vượt × 18% + 5% tổng (vd 150tr → 31,5tr).
  gold: [UNDER_50, FROM_50, { ...FROM_100, bonusRate: 0.05 }],
  // Kim cương — từ 200tr: 200tr × 18% + vượt × 21% + 12% tổng (vd 300tr → 93tr).
  diamond: [
    UNDER_50,
    FROM_50,
    FROM_100,
    { from: 200_000_000, baseAmount: 200_000_000, baseRate: 0.18, excessRate: 0.21, bonusRate: 0.12 },
  ],
};

function segmentFor(tier: PartnerTier, revenue: number): TierSegment {
  const schedule = TIER_SCHEDULES[tier];
  let found = schedule[0];
  for (const segment of schedule) {
    if (revenue >= segment.from) found = segment;
  }
  return found;
}

export type TierPayoutLine = {
  kind: "base" | "excess" | "bonus";
  /** Doanh số nhân với rate. */
  base: number;
  rate: number;
  amount: number;
  /** Với "excess": mốc bắt đầu tính phần vượt (0 = toàn bộ doanh số). */
  from: number;
};

export type TierPayout = {
  tier: PartnerTier;
  revenue: number;
  lines: TierPayoutLine[];
  total: number;
  effectiveRate: number;
};

/**
 * Thù lao tháng theo biểu của phụ lục. Các dòng đã làm tròn xuống tới đồng và dòng cuối
 * nhận phần dư, nên Σ lines.amount = total — giải thích trên giấy đề nghị khớp từng đồng.
 */
export function calcTierPayout(tier: PartnerTier, newCustomerRevenue: number): TierPayout {
  const revenue = Math.max(0, newCustomerRevenue);
  const segment = segmentFor(tier, revenue);
  const exact: TierPayoutLine[] = [];
  if (segment.baseAmount > 0) {
    exact.push({ kind: "base", base: segment.baseAmount, rate: segment.baseRate, amount: segment.baseAmount * segment.baseRate, from: 0 });
  }
  exact.push({
    kind: "excess",
    base: revenue - segment.from,
    rate: segment.excessRate,
    amount: (revenue - segment.from) * segment.excessRate,
    from: segment.from,
  });
  if (segment.bonusRate > 0) {
    exact.push({ kind: "bonus", base: revenue, rate: segment.bonusRate, amount: revenue * segment.bonusRate, from: 0 });
  }

  const total = Math.floor(exact.reduce((sum, line) => sum + line.amount, 0) + 1e-6);
  let allocated = 0;
  const lines = exact.map((line, index) => {
    const amount = index === exact.length - 1 ? total - allocated : Math.floor(line.amount + 1e-6);
    allocated += amount;
    return { ...line, amount };
  });

  return {
    tier,
    revenue,
    lines,
    total,
    effectiveRate: revenue > 0 ? total / revenue : 0,
  };
}

/** Thù lao tăng thêm cho mỗi đồng doanh số khách mới kế tiếp ở mức doanh số hiện tại. */
export function marginalTierRate(tier: PartnerTier, newCustomerRevenue: number): number {
  const segment = segmentFor(tier, Math.max(0, newCustomerRevenue));
  return segment.excessRate + segment.bonusRate;
}

/**
 * Phụ lục sửa đổi: từ tháng này mọi hạng của đối tác, kể cả Thường, tính chung một cách theo
 * loại đơn. Các tháng trước giữ cách cũ. NVKD không đổi.
 */
export const SPLIT_POLICY_FROM = "2026-11";
/** "11/2026" — cho chữ giải thích ("từ …", "trước …"). */
export const SPLIT_POLICY_LABEL = `${SPLIT_POLICY_FROM.slice(5)}/${SPLIT_POLICY_FROM.slice(0, 4)}`;
/** (b) gia hạn, (c) nâng cấp và gói khác — như nhau ở mọi hạng. */
export const REPEAT_RATE = 0.1;
/**
 * Từ SPLIT_POLICY_FROM, khách mua lần đầu gồm cả khách quay lại: gói hội viên trả phí gần nhất đã
 * hết hạn đủ chừng này tháng tính tới ngày thanh toán đơn mới, so theo ngày (xem classifiedCte).
 */
export const NEW_CUSTOMER_LAPSE_MONTHS = 3;

/** Ví dụ cho chữ giải thích: mốc so theo ngày hết hạn và ngày mua lại, không theo giờ. */
export const NEW_CUSTOMER_LAPSE_EXAMPLE = `gói hết hạn ngày ${formatDay(new Date(2026, 1, 21))} thì mua lại từ ngày ${formatDay(
  new Date(2026, 1 + NEW_CUSTOMER_LAPSE_MONTHS, 21),
)} là khách mới`;

/** `month` dạng YYYY-MM. */
export function usesSplitPolicy(month: string): boolean {
  return month >= SPLIT_POLICY_FROM;
}

/**
 * Thù lao đối tác theo cách tính thống nhất cho mọi hạng:
 *   (a) khách mua gói hội viên lần đầu (kể cả khách quay lại sau NEW_CUSTOMER_LAPSE_MONTHS tháng)
 *       theo biểu của hạng — Thường: bậc lũy tiến CTV; Bạc/Vàng/Kim cương: biểu phụ lục. Mốc chỉ
 *       xét doanh số khách mới;
 *   (b) gia hạn, (c) nâng cấp và gói khác: REPEAT_RATE, không cộng vào mốc.
 * `revenue.total` là doanh số gói hội viên (đã trừ khóa học), `newCustomer` là phần khách mới.
 */
export function calcSplitRemuneration(
  tier: ContractTier,
  revenue: { total: number; newCustomer: number },
): RemunerationBreakdown {
  const newRevenue = Math.max(0, revenue.newCustomer);
  const repeatRevenue = Math.max(0, revenue.total - newRevenue);
  const newCommission = isPartnerTier(tier)
    ? calcTierPayout(tier, newRevenue).total
    : calcMonthlyRemuneration(newRevenue, "collaborator").total;
  const repeatCommission = Math.floor(repeatRevenue * REPEAT_RATE + 1e-6);
  const base = newRevenue + repeatRevenue;
  const total = newCommission + repeatCommission;
  return {
    partnerType: "collaborator",
    revenue: base,
    baseSalary: 0,
    commission: total,
    performanceBonus: 0,
    total,
    effectiveRate: base > 0 ? total / base : 0,
    policy: "split",
    tier: isPartnerTier(tier) ? tier : null,
    split: { newRevenue, newCommission, repeatRevenue, repeatCommission },
  };
}

/**
 * Thù lao tháng `month` (YYYY-MM) của một đối tác theo phụ lục áp dụng cho tháng đó.
 *   - CTV từ SPLIT_POLICY_FROM: calcSplitRemuneration (mọi hạng).
 *   - CTV có phụ lục Bạc/Vàng/Kim cương trước đó: biểu của phụ lục trên DS khách mới.
 *   - Còn lại (NVKD, hoặc CTV chính sách Thường trước đó): bậc lũy tiến trên toàn bộ DS.
 */
export function calcPartnerRemuneration(
  partnerType: PartnerType,
  tier: ContractTier,
  revenue: { total: number; newCustomer: number },
  month: string,
): RemunerationBreakdown {
  const normalizedType = normalizePartnerType(partnerType);
  if (normalizedType === "collaborator" && usesSplitPolicy(month)) {
    return calcSplitRemuneration(tier, revenue);
  }
  if (normalizedType === "collaborator" && isPartnerTier(tier)) {
    const payout = calcTierPayout(tier, revenue.newCustomer);
    return {
      partnerType: normalizedType,
      revenue: payout.revenue,
      baseSalary: 0,
      commission: payout.total,
      performanceBonus: 0,
      total: payout.total,
      effectiveRate: payout.effectiveRate,
      policy: "tier",
      tier,
    };
  }
  return calcMonthlyRemuneration(revenue.total, normalizedType);
}
