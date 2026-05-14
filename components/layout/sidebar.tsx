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
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const partnerNav: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboardIcon, exact: true },
  { href: "/payment/create", label: "Tạo link thanh toán", icon: LinkIcon },
  { href: "/payment", label: "Link thanh toán đã tạo", icon: TicketIcon, exact: true },
  { href: "/customers", label: "Khách hàng", icon: UsersIcon },
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboardIcon, exact: true },
  { href: "/admin/partners", label: "Quản lý đối tác", icon: ShieldIcon },
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
        "flex items-center gap-3 rounded-md py-2 pr-3 pl-3 text-sm transition-all duration-150",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active
          ? "border-l-2 border-sidebar-primary bg-sidebar-accent pl-[10px] font-semibold text-sidebar-accent-foreground"
          : "font-medium text-sidebar-foreground/70",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          active ? "text-sidebar-primary" : "text-sidebar-foreground/50",
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      {/* Brand header */}
      <Link href="/" className="flex h-14 items-center gap-2.5 border-b px-4 hover:bg-sidebar-accent/50 transition-colors">
        <Image src="/logo.png" alt="FireAnt" width={30} height={30} className="rounded-lg shadow-sm" />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight">FireAnt</span>
          <span className="text-[11px] font-medium text-sidebar-primary/70">Partners</span>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {!isAdmin && (
          <>
            <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
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
            <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
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

      {/* Sidebar footer accent */}
      <div className="border-t px-4 py-3">
        <div className="rounded-md bg-sidebar-accent/60 px-3 py-2">
          <p className="text-[10px] font-medium text-sidebar-foreground/50">
            FireAnt Partners v2
          </p>
        </div>
      </div>
    </aside>
  );
}
