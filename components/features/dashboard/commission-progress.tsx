import { COMMISSION_BANDS } from "@/lib/commission";
import { formatVNDCompact } from "@/lib/utils/currency";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Band = (typeof COMMISSION_BANDS)[number];

function findBandIndex(revenue: number): number {
  for (let i = COMMISSION_BANDS.length - 1; i >= 0; i--) {
    if (revenue >= COMMISSION_BANDS[i].from) return i;
  }
  return 0;
}

export function CommissionProgress({
  monthlyRevenue,
  className,
}: {
  monthlyRevenue: number;
  className?: string;
}) {
  const bandIndex = findBandIndex(monthlyRevenue);
  const currentBand: Band = COMMISSION_BANDS[bandIndex];
  const nextBand: Band | undefined = COMMISSION_BANDS[bandIndex + 1];

  const isMaxBand = currentBand.to === Infinity;

  // Phần trăm tiến độ trong band hiện tại
  const progressPct = isMaxBand
    ? 100
    : Math.min(
        100,
        ((monthlyRevenue - currentBand.from) /
          (currentBand.to - currentBand.from)) *
          100,
      );

  const remaining = nextBand ? nextBand.from - monthlyRevenue : 0;

  // Các mốc hiển thị: band trước, band hiện tại, band tiếp theo
  const milestoneLabel = (b: Band) =>
    `${(b.rate * 100 % 1 === 0 ? (b.rate * 100).toFixed(0) : (b.rate * 100).toFixed(1))}%`;

  return (
    <Card className={cn("flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-md", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          Mức hoa hồng tháng này
        </span>
        <span className="num text-base font-bold text-brand">
          {milestoneLabel(currentBand)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand/80 to-brand transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Mốc dưới thanh */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatVNDCompact(currentBand.from)}</span>
        {!isMaxBand && (
          <span>{formatVNDCompact(currentBand.to)}</span>
        )}
      </div>

      {/* Thông điệp */}
      {isMaxBand ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Đang ở mức cao nhất{" "}
          <span className="font-semibold text-foreground">15%</span>. Tiếp tục phát huy!
        </p>
      ) : nextBand && remaining > 0 ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Cần thêm{" "}
          <span className="font-semibold text-foreground">
            {formatVNDCompact(remaining)}
          </span>{" "}
          doanh số để đạt mức{" "}
          <span className="font-semibold text-foreground">
            {milestoneLabel(nextBand)}
          </span>
        </p>
      ) : null}
    </Card>
  );
}
