/**
 * Metadata hiển thị cho các hạng dịch vụ (dùng chung server + client, không import DB).
 * ServiceID hội viên: 33 Thiết yếu (Basic) < 34 Chuyên nghiệp (Pro+AI) < 35 Cao cấp (Premium).
 * 39 = Khóa học.
 */
export const MEMBERSHIP_BASIC = 33;
export const MEMBERSHIP_PRO = 34;
export const MEMBERSHIP_PREMIUM = 35;
export const COURSE_SERVICE = 39;

export const MEMBERSHIP_SERVICE_IDS = [MEMBERSHIP_BASIC, MEMBERSHIP_PRO, MEMBERSHIP_PREMIUM] as const;

export function isMembershipService(serviceId: number): boolean {
  return (MEMBERSHIP_SERVICE_IDS as readonly number[]).includes(serviceId);
}

export type TierMeta = {
  label: string;
  tag: string;
  /** Chấm màu / icon */
  dot: string;
  /** Badge nền nhạt + chữ đậm */
  badge: string;
  /** Khối chọn khi active */
  active: string;
  /** Chữ nhấn */
  text: string;
};

export const TIER_META: Record<number, TierMeta> = {
  [MEMBERSHIP_BASIC]: {
    label: "Thiết yếu",
    tag: "Basic",
    dot: "bg-sky-500",
    badge: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    active: "border-sky-500 bg-sky-50/70 ring-2 ring-sky-500/30 dark:bg-sky-500/10",
    text: "text-sky-700 dark:text-sky-300",
  },
  [MEMBERSHIP_PRO]: {
    label: "Chuyên nghiệp",
    tag: "Pro+AI",
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
    active: "border-violet-500 bg-violet-50/70 ring-2 ring-violet-500/30 dark:bg-violet-500/10",
    text: "text-violet-700 dark:text-violet-300",
  },
  [MEMBERSHIP_PREMIUM]: {
    label: "Cao cấp",
    tag: "Premium",
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    active: "border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/30 dark:bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
  },
  [COURSE_SERVICE]: {
    label: "Khóa học",
    tag: "Edu",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    active: "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/30 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
  },
};

const FALLBACK_META: TierMeta = {
  label: "Gói dịch vụ",
  tag: "",
  dot: "bg-muted-foreground",
  badge: "border-border bg-muted text-foreground",
  active: "border-primary bg-primary/5 ring-2 ring-primary/30",
  text: "text-foreground",
};

export function tierMeta(serviceId: number): TierMeta {
  return TIER_META[serviceId] ?? FALLBACK_META;
}

export function tierName(serviceId: number): string {
  return tierMeta(serviceId).label;
}

export function durationLabel(months: number): string {
  if (months === 12) return "1 năm";
  if (months === 24) return "2 năm";
  if (months === 1) return "1 tháng";
  return `${months} tháng`;
}

/** Ngân hàng nhận tiền của tài khoản định danh OnePay (VietQR bankCode 970418). */
export const RECEIVING_BANK = {
  shortName: "BIDV",
  fullName: "Ngân hàng TMCP Đầu tư & Phát triển Việt Nam",
  beneficiary: "FireAnt",
} as const;
