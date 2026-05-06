/**
 * Commission engine — 12-band tiered bracket model.
 *
 * Rules (confirmed với business owner):
 *   - Prospective: rate mới chỉ áp dụng cho doanh số PHÁT SINH SAU khi đạt mức mới
 *   - Incremental: giống thuế lũy tiến — từng phần doanh số tính theo band tương ứng
 *   - Monthly reset: tích lũy reset về 0 đầu mỗi tháng
 *   - Đồng nhất: tất cả partner dùng cùng bảng rate này
 *
 * Ví dụ tháng có doanh số 60M:
 *   0  → 30M : 0%   →  0
 *   30 → 50M : 10%  →  2,000,000
 *   50 → 60M : 10.5% → 1,050,000
 *   Tổng hoa hồng: 3,050,000
 */

export const COMMISSION_BANDS = [
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

/**
 * Tính hoa hồng cho 1 đơn, biết trước đó trong tháng đã tích lũy bao nhiêu.
 *
 * priorRevenue : tổng doanh số TRƯỚC đơn này trong cùng tháng
 * orderAmount  : giá trị đơn này
 *
 * Tại sao nhận 2 args: mô hình prospective + incremental yêu cầu biết
 * vị trí tích lũy hiện tại để áp đúng band cho từng phần của đơn.
 */
export function calcOrderCommission(priorRevenue: number, orderAmount: number): number {
  if (orderAmount <= 0) return 0;
  let remaining = orderAmount;
  let cursor = priorRevenue;
  let commission = 0;

  for (const band of COMMISSION_BANDS) {
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
export function calcCommissionFromTotal(monthlyRevenue: number): number {
  return calcOrderCommission(0, monthlyRevenue);
}

/**
 * Rate hiệu lực hiện tại dựa trên doanh số tích lũy đã có.
 * Trả về rate của band tiếp theo sẽ được áp dụng.
 */
export function currentEffectiveRate(cumulativeRevenue: number): number {
  const band =
    [...COMMISSION_BANDS].reverse().find((b) => cumulativeRevenue >= b.from) ??
    COMMISSION_BANDS[0];
  return band.rate;
}

/** Start/end tháng hiện tại (local time). */
export function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}
