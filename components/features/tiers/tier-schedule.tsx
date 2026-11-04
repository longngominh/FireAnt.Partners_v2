import {
  COLLABORATOR_COMMISSION_BANDS,
  FLAT_RATE,
  FLAT_RATE_THRESHOLD,
  TIER_SCHEDULES,
  type ContractTier,
  type TierSegment,
} from "@/lib/commission";
import { cn } from "@/lib/utils";
import { formatShortVND } from "@/lib/utils/currency";

function pct(rate: number): string {
  return `${(rate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function short(value: number): string {
  return formatShortVND(value).replace(",0 ", " ");
}

function formula(segment: TierSegment): string {
  const parts: string[] = [];
  if (segment.baseAmount > 0) parts.push(`${short(segment.baseAmount)} × ${pct(segment.baseRate)}`);
  parts.push(segment.from > 0 ? `phần vượt ${short(segment.from)} × ${pct(segment.excessRate)}` : `${pct(segment.excessRate)} doanh thu`);
  if (segment.bonusRate > 0) parts.push(`${pct(segment.bonusRate)} tổng doanh thu`);
  return parts.join(" + ");
}

type Row = { key: string; range: string; text: string; active: boolean };

function contractRows(tier: Exclude<ContractTier, "normal">, revenue: number | null): Row[] {
  const schedule = TIER_SCHEDULES[tier];
  return schedule.map((segment, index) => {
    const next = schedule[index + 1];
    const range = next
      ? segment.from === 0
        ? `Dưới ${short(next.from)}`
        : `${short(segment.from)} – dưới ${short(next.from)}`
      : `Từ ${short(segment.from)}`;
    const active = revenue !== null && revenue >= segment.from && (!next || revenue < next.from);
    return { key: String(segment.from), range, text: formula(segment), active };
  });
}

function normalRows(revenue: number | null): Row[] {
  const bands = COLLABORATOR_COMMISSION_BANDS.filter((b) => b.rate > 0);
  const rows: Row[] = [];
  const first = COLLABORATOR_COMMISSION_BANDS[0];
  if (first && first.rate === 0) {
    rows.push({
      key: "0",
      range: `Dưới ${short(first.to)}`,
      text: "Chưa có hoa hồng",
      active: revenue !== null && revenue < first.to,
    });
  }
  for (const band of bands) {
    if (band.from >= FLAT_RATE_THRESHOLD) break;
    const to = Math.min(band.to, FLAT_RATE_THRESHOLD);
    rows.push({
      key: String(band.from),
      range: `${short(band.from)} – dưới ${short(to)}`,
      text: `${pct(band.rate)} phần doanh số trong bậc`,
      active: revenue !== null && revenue >= band.from && revenue < to,
    });
  }
  rows.push({
    key: "flat",
    range: `Từ ${short(FLAT_RATE_THRESHOLD)}`,
    text: `${pct(FLAT_RATE)} toàn bộ doanh số`,
    active: revenue !== null && revenue >= FLAT_RATE_THRESHOLD,
  });
  return rows;
}

/**
 * Biểu của phụ lục (hoặc bậc lũy tiến của chính sách Thường), tô đậm dòng ứng với doanh số
 * tháng này. Phụ lục tính trên doanh thu khách mới; Thường trước SPLIT_POLICY_FROM tính trên doanh số gói
 * hội viên. Có `repeatRate` (từ SPLIT_POLICY_FROM): các dòng là phần khách mới, thêm dòng gia hạn, nâng cấp.
 */
export function TierSchedule({
  tier,
  revenue = null,
  repeatRate = null,
  className,
}: {
  tier: ContractTier;
  /** Doanh số căn cứ của tháng đang xem (từ SPLIT_POLICY_FROM: doanh số khách mới) — để tô dòng "Tháng này". */
  revenue?: number | null;
  /** Tỷ lệ gia hạn, nâng cấp khi tháng tính theo loại đơn. */
  repeatRate?: number | null;
  className?: string;
}) {
  const rows = tier === "normal" ? normalRows(revenue) : contractRows(tier, revenue);
  if (repeatRate !== null) {
    rows.push({
      key: "repeat",
      range: "Gia hạn, nâng cấp",
      text: `${pct(repeatRate)} doanh số, mọi mức — không tính vào mốc`,
      active: false,
    });
  }
  return (
    <div role="table" aria-label="Biểu thù lao" className={cn("flex flex-col overflow-hidden rounded-xl border text-[13px]", className)}>
      {rows.map((row) => (
        <div
          key={row.key}
          role="row"
          className={cn("grid grid-cols-[140px_minmax(0,1fr)] gap-3 border-t px-3.5 py-2.5 first:border-t-0", row.active && "bg-primary/8")}
        >
          <span role="cell" className={cn("flex flex-col gap-0.5", row.active ? "font-semibold" : "text-muted-foreground")}>
            {row.range}
            {row.active ? <span className="text-xs font-medium text-primary">Tháng này</span> : null}
          </span>
          <span role="cell" className={row.active ? "font-medium" : undefined}>
            {row.text}
          </span>
        </div>
      ))}
    </div>
  );
}
