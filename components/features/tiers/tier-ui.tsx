import { GemIcon } from "lucide-react";
import { CONTRACT_TIER_LABELS, contractTierTitle, type ContractTier } from "@/lib/commission";
import { cn } from "@/lib/utils";

/**
 * Class Tailwind tĩnh cho từng phụ lục (không ghép chuỗi động để Tailwind quét được).
 * Màu lấy từ token --tier-* nên tự đổi theo giao diện sáng/tối; chính sách Thường dùng xám.
 */
export const TIER_CLASSES: Record<
  ContractTier,
  { mark: string; soft: string; border: string; fg: string; ring: string; stroke: string }
> = {
  normal: {
    mark: "bg-muted-foreground/70",
    soft: "bg-muted",
    border: "border-border",
    fg: "text-foreground/80",
    ring: "ring-muted",
    stroke: "stroke-muted-foreground",
  },
  silver: {
    mark: "bg-tier-silver",
    soft: "bg-tier-silver-soft",
    border: "border-tier-silver-border",
    fg: "text-tier-silver-fg",
    ring: "ring-tier-silver-soft",
    stroke: "stroke-tier-silver",
  },
  gold: {
    mark: "bg-tier-gold",
    soft: "bg-tier-gold-soft",
    border: "border-tier-gold-border",
    fg: "text-tier-gold-fg",
    ring: "ring-tier-gold-soft",
    stroke: "stroke-tier-gold",
  },
  diamond: {
    mark: "bg-tier-diamond",
    soft: "bg-tier-diamond-soft",
    border: "border-tier-diamond-border",
    fg: "text-tier-diamond-fg",
    ring: "ring-tier-diamond-soft",
    stroke: "stroke-tier-diamond",
  },
};

/** Biến CSS màu mark — dùng cho SVG/recharts cần giá trị màu thay vì class. */
export const TIER_COLOR_VAR: Record<ContractTier, string> = {
  normal: "var(--muted-foreground)",
  silver: "var(--tier-silver)",
  gold: "var(--tier-gold)",
  diamond: "var(--tier-diamond)",
};

export function TierDot({ tier, className }: { tier: ContractTier; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", TIER_CLASSES[tier].mark, className)} />;
}

/** Chip tên phụ lục ngắn: "Vàng", "Thường"… */
export function TierBadge({
  tier,
  suffix,
  size = "sm",
  className,
}: {
  tier: ContractTier;
  /** Thêm sau tên phụ lục, vd "· T10". */
  suffix?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const c = TIER_CLASSES[tier];
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "h-5.5 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
        c.soft,
        c.border,
        c.fg,
        className,
      )}
    >
      <TierDot tier={tier} className={size === "md" ? "size-2" : undefined} />
      {CONTRACT_TIER_LABELS[tier]}
      {suffix ? <span className="font-medium opacity-80">{suffix}</span> : null}
    </span>
  );
}

/** Chip đầy đủ trên đầu trang: "Hạng Vàng · áp dụng từ 01/10/2026" / "Chính sách Thường". */
export function ContractChip({
  tier,
  since,
  className,
}: {
  tier: ContractTier;
  /** Ngày bắt đầu áp dụng đã định dạng (dd/MM/yyyy); bỏ trống với chính sách Thường chưa chọn. */
  since?: string | null;
  className?: string;
}) {
  const c = TIER_CLASSES[tier];
  return (
    <span
      className={cn(
        "inline-flex h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold whitespace-nowrap",
        c.soft,
        c.border,
        c.fg,
        className,
      )}
    >
      <TierDot tier={tier} className="size-2" />
      {contractTierTitle(tier)}
      {since ? <span className="font-medium opacity-80">· áp dụng từ {since}</span> : null}
    </span>
  );
}

export function TierMedallion({
  tier,
  size = "md",
  className,
}: {
  tier: ContractTier;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const c = TIER_CLASSES[tier];
  const box = size === "sm" ? "size-8" : size === "lg" ? "size-14" : "size-11";
  const icon = size === "sm" ? "size-4" : size === "lg" ? "size-7" : "size-5";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-white ring-4",
        box,
        c.mark,
        c.ring,
        className,
      )}
    >
      <GemIcon className={icon} strokeWidth={2} />
    </span>
  );
}
