import {
  BookOpenIcon,
  ChartColumnIcon,
  ChartNoAxesColumnIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LinkIcon,
  UserCheckIcon,
  UserRoundIcon,
  UserRoundXIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Ba không gian tách biệt: cổng đối tác (người ký hợp đồng), cổng nhân viên bán hàng của
 * đối tác (chỉ link, khách, doanh số của chính mình) và bảng quản trị FireAnt.
 */
export type Workspace = "partner" | "staff" | "admin";

export type NavBadgeKey = "approvals" | "pendingAccounts";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Chỉ active khi đúng đường dẫn (không tính trang con). */
  exact?: boolean;
  badge?: NavBadgeKey;
};

export type NavSection = { label: string; items: NavItem[] };

const SALES_SECTION: NavSection = {
  label: "Bán hàng",
  items: [
    { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboardIcon, exact: true },
    { href: "/payment", label: "Link bán hàng", icon: LinkIcon, exact: true },
    { href: "/customers", label: "Khách hàng", icon: UsersIcon },
    { href: "/payment/pending-account", label: "Đơn chờ tài khoản", icon: UserRoundXIcon, badge: "pendingAccounts" },
  ],
};

export const PARTNER_NAV: NavSection[] = [
  SALES_SECTION,
  {
    label: "Thu nhập",
    items: [{ href: "/earnings", label: "Thu nhập & hợp đồng", icon: WalletIcon }],
  },
  {
    label: "Nhân viên",
    items: [{ href: "/team", label: "Nhân viên bán hàng", icon: UsersRoundIcon }],
  },
  {
    label: "Tài khoản",
    items: [
      { href: "/profile", label: "Hồ sơ & thông tin chi trả", icon: UserRoundIcon },
      { href: "/guide", label: "Hướng dẫn bán hàng", icon: BookOpenIcon },
    ],
  },
];

export const STAFF_NAV: NavSection[] = [
  SALES_SECTION,
  {
    label: "Doanh số",
    items: [{ href: "/sales", label: "Doanh số của tôi", icon: ChartNoAxesColumnIcon }],
  },
  {
    label: "Tài khoản",
    items: [
      { href: "/profile", label: "Hồ sơ cá nhân", icon: UserRoundIcon },
      { href: "/guide", label: "Hướng dẫn bán hàng", icon: BookOpenIcon },
    ],
  },
];

export const ADMIN_NAV: NavSection[] = [
  {
    label: "Điều hành",
    items: [
      { href: "/admin", label: "Tổng quan hệ thống", icon: ChartColumnIcon, exact: true },
      { href: "/admin/partners", label: "Đối tác", icon: UsersIcon },
      { href: "/admin/approvals", label: "Duyệt nhân viên", icon: UserCheckIcon, badge: "approvals" },
    ],
  },
  {
    label: "Tài chính",
    items: [{ href: "/admin/payouts", label: "Thù lao & chi trả", icon: WalletIcon }],
  },
  {
    label: "Bán hàng toàn hệ thống",
    items: [
      { href: "/admin/links", label: "Link bán hàng", icon: LinkIcon },
      { href: "/admin/customers", label: "Khách hàng", icon: UsersRoundIcon },
      { href: "/admin/pending-accounts", label: "Đơn chờ tài khoản", icon: UserRoundXIcon },
    ],
  },
  {
    label: "Cấu hình",
    items: [{ href: "/admin/tiers", label: "Biểu phụ lục", icon: FileTextIcon }],
  },
];

export const NAV_BY_WORKSPACE: Record<Workspace, NavSection[]> = {
  partner: PARTNER_NAV,
  staff: STAFF_NAV,
  admin: ADMIN_NAV,
};

export function isNavActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
