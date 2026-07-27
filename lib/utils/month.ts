/**
 * Tiện ích làm việc với "kỳ tháng" dạng `YYYY-MM`.
 *
 * Kỳ luôn là tháng dương lịch đầy đủ: từ 00:00 ngày 1 đến 00:00 ngày 1 tháng
 * kế tiếp (end là mốc exclusive để không bỏ sót đơn phát sinh cuối ngày cuối tháng).
 */

export type MonthKey = string; // `YYYY-MM`

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

export function toMonthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(): MonthKey {
  return toMonthKey(new Date());
}

/** Trả về kỳ hợp lệ gần nhất: giá trị sai định dạng hoặc ở tương lai đều rơi về tháng hiện tại. */
export function normalizeMonthKey(value: unknown): MonthKey {
  if (!isMonthKey(value)) return currentMonthKey();
  return value > currentMonthKey() ? currentMonthKey() : value;
}

export function parseMonthKey(month: MonthKey): { year: number; month: number } {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, month: monthNumber };
}

export function monthRange(month: MonthKey): { start: Date; end: Date } {
  const { year, month: monthNumber } = parseMonthKey(month);
  return {
    start: new Date(year, monthNumber - 1, 1, 0, 0, 0, 0),
    end: new Date(year, monthNumber, 1, 0, 0, 0, 0),
  };
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const { year, month: monthNumber } = parseMonthKey(month);
  return toMonthKey(new Date(year, monthNumber - 1 + delta, 1));
}

export function formatMonthLabel(month: MonthKey): string {
  const { year, month: monthNumber } = parseMonthKey(month);
  return `Tháng ${monthNumber}/${year}`;
}

/** Nhãn khoảng ngày đầy đủ, ví dụ "01/07/2026 – 31/07/2026". */
export function formatMonthRangeLabel(month: MonthKey): string {
  const { start, end } = monthRange(month);
  const lastDay = new Date(end.getTime() - 1);
  const dmy = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return `${dmy(start)} – ${dmy(lastDay)}`;
}
