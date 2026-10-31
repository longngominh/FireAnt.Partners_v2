const VND = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const VND_COMPACT = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const NUMBER = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

export function formatVND(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "0 ₫";
  return VND.format(value);
}

export function formatVNDCompact(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "0 ₫";
  const n = typeof value === "bigint" ? Number(value) : value;
  return `${VND_COMPACT.format(n)} ₫`;
}

export function formatNumber(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "0";
  return NUMBER.format(value);
}

const ONE_DECIMAL = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TWO_DECIMALS = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Số tiền gọn kiểu người bán hàng hay nói: "168,5 tr", "1,77 tỷ". Dưới 1 triệu giữ
 * nguyên dạng đầy đủ để không làm tròn mất tiền lẻ.
 */
export function formatShortVND(value: number | null | undefined): string {
  const n = value ?? 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${TWO_DECIMALS.format(n / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${ONE_DECIMAL.format(n / 1_000_000)} tr`;
  return formatVND(n);
}

export function formatPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function parseVNDInput(raw: string): number {
  const cleaned = raw.replace(/[^\d-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
