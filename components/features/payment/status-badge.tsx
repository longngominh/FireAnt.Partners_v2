import { Badge } from "@/components/ui/badge";
import type { CouponStatus } from "@/lib/data/payment";

const map: Record<CouponStatus, { label: string; className: string }> = {
  PAID: {
    label: "Đã thanh toán",
    className: "border-success/30 bg-success/15 text-success hover:bg-success/20",
  },
  PENDING: {
    label: "Chờ thanh toán",
    className:
      "border-warning/30 bg-warning/15 text-warning-foreground hover:bg-warning/20 [color:var(--warning-foreground)]",
  },
  EXPIRED: {
    label: "Hết hạn",
    className: "border-muted-foreground/30 bg-muted text-muted-foreground hover:bg-muted/80",
  },
  USED: {
    label: "Đã sử dụng",
    className: "border-info/30 bg-info/10 text-info hover:bg-info/20",
  },
};

export function StatusBadge({ status }: { status: CouponStatus }) {
  const cfg = map[status];
  return (
    <Badge variant="outline" className={`px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}
