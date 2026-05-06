"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  LinkIcon,
  TicketIcon,
  UsersIcon,
  ShieldIcon,
  BarChart3Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const partnerNav: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboardIcon, exact: true },
  { href: "/payment/create", label: "Tạo link thanh toán", icon: LinkIcon },
  { href: "/payment", label: "Coupon đã tạo", icon: TicketIcon, exact: true },
  { href: "/customers", label: "Khách hàng", icon: UsersIcon },
];

const adminNav: NavItem[] = [
  { href: "/admin/partners", label: "Quản lý đối tác", icon: ShieldIcon },
  { href: "/admin/partners?tab=performance", label: "Hiệu suất", icon: BarChart3Icon },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  const cleanHref = href.split("?")[0];
  if (exact) return pathname === cleanHref;
  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href, item.exact);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-foreground")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Image src="/logo.png" alt="FireAnt" width={28} height={28} className="rounded-md" />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold">FireAnt</span>
          <span className="text-xs text-muted-foreground">Partners</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {!isAdmin && (
          <>
            <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Đối tác
            </div>
            <div className="flex flex-col gap-0.5">
              {partnerNav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </>
        )}

        {isAdmin && (
          <>
            <Separator className="my-4" />
            <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quản trị
            </div>
            <div className="flex flex-col gap-0.5">
              {adminNav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}
