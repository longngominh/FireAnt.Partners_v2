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

export function parseVNDInput(raw: string): number {
  const cleaned = raw.replace(/[^\d-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
