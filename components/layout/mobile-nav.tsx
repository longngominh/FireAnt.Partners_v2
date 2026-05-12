"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  MenuIcon,
  LayoutDashboardIcon,
  LinkIcon,
  TicketIcon,
  UsersIcon,
  ShieldIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";

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

export function MobileNav({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = role === "admin";
  const navItems = isAdmin ? adminNav : partnerNav;

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-9 w-9"
        aria-label="Mở menu"
      >
        <MenuIcon className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetHeader className="flex h-14 flex-row items-center gap-2 border-b px-4 py-0">
            <Image src="/logo.png" alt="FireAnt" width={28} height={28} className="rounded-md" />
            <SheetTitle className="flex flex-col leading-none">
              <span className="text-sm font-semibold">FireAnt</span>
              <span className="text-xs text-muted-foreground font-normal">Partners</span>
            </SheetTitle>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto px-3 py-5">
            <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              {isAdmin ? "Quản trị" : "Đối tác"}
            </div>
            <div className="flex flex-col gap-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md py-2.5 pr-3 pl-3 text-sm transition-all duration-150",
                        "hover:bg-accent hover:text-accent-foreground",
                        active
                          ? "border-l-2 border-primary bg-accent pl-[10px] font-semibold text-accent-foreground"
                          : "font-medium text-foreground/70",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-foreground/50")} />
                      <span>{item.label}</span>
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
