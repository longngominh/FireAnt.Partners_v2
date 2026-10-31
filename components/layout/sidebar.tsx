"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2Icon, CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  NAV_BY_WORKSPACE,
  isNavActive,
  type NavBadgeKey,
  type Workspace,
} from "./nav";

export type ShellIdentity = {
  name: string;
  email: string;
  /** "Hạng Vàng · từ 01/10/2026", "Nhân viên · Trần Minh Anh" hoặc "Quản lý FireAnt". */
  roleLabel: string;
};

export type SidebarProps = {
  workspace: Workspace;
  identity: ShellIdentity;
  /** Người dùng có cả hai không gian (quản lý kiêm CTV) → hiện bộ chuyển. */
  canSwitch: boolean;
  badges?: Partial<Record<NavBadgeKey, number>>;
  /** Phần tử render sẵn ở server (vd thẻ hạng), đặt cuối thanh bên. */
  footer?: React.ReactNode;
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
}

function WorkspaceCard({ workspace, identity }: { workspace: Workspace; identity: ShellIdentity }) {
  if (workspace === "admin") {
    return (
      <>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-admin-chip text-admin-chip-foreground">
          <Building2Icon className="size-4.5" />
        </span>
        <span className="flex min-w-0 flex-col text-left leading-tight">
          <span className="truncate text-sm font-semibold text-foreground">Bảng quản trị</span>
          <span className="truncate text-xs text-sidebar-muted">Toàn hệ thống</span>
        </span>
      </>
    );
  }
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
        {initials(identity.name)}
      </span>
      <span className="flex min-w-0 flex-col text-left leading-tight">
        <span className="truncate text-sm font-semibold text-foreground">{identity.name}</span>
        <span className="truncate text-xs text-sidebar-muted">{identity.roleLabel}</span>
      </span>
    </>
  );
}

function WorkspaceSwitcher({
  workspace,
  identity,
  canSwitch,
}: Pick<SidebarProps, "workspace" | "identity" | "canSwitch">) {
  const cardClass =
    "flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border bg-background/60 p-2 transition-colors";

  if (!canSwitch) {
    return (
      <div className={cardClass}>
        <WorkspaceCard workspace={workspace} identity={identity} />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(cardClass, "cursor-pointer hover:bg-sidebar-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none")}
          aria-label="Đổi không gian làm việc"
        >
          <WorkspaceCard workspace={workspace} identity={identity} />
          <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-sidebar-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Không gian làm việc
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2">
          <Link href="/admin">
            <Building2Icon />
            <span className="flex flex-col leading-tight">
              <span className="font-medium">Bảng quản trị FireAnt</span>
              <span className="text-xs text-muted-foreground">Đối tác, nhân viên, chi trả</span>
            </span>
            {workspace === "admin" ? <CheckIcon className="ml-auto text-primary" /> : null}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2">
          <Link href="/dashboard">
            <span className="flex size-4 items-center justify-center text-[9px] font-bold">
              {initials(identity.name)}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-medium">Cổng đối tác của tôi</span>
              <span className="text-xs text-muted-foreground">Link, khách và thu nhập của bạn</span>
            </span>
            {workspace !== "admin" ? <CheckIcon className="ml-auto text-primary" /> : null}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarContent({
  workspace,
  identity,
  canSwitch,
  badges,
  footer,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = NAV_BY_WORKSPACE[workspace];
  const home = workspace === "admin" ? "/admin" : "/dashboard";

  return (
    <div className="flex min-h-full flex-col gap-5 px-3 py-4">
      <Link href={home} onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
        <Image src="/logo.png" alt="" width={30} height={30} className="rounded-lg" />
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-tight text-foreground">FireAnt</span>
          <span className="text-xs font-medium text-sidebar-muted">Partners</span>
        </span>
        {workspace === "admin" ? (
          <span className="ml-auto rounded-md bg-admin-chip px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-admin-chip-foreground">
            QUẢN TRỊ
          </span>
        ) : null}
      </Link>

      <WorkspaceSwitcher workspace={workspace} identity={identity} canSwitch={canSwitch} />

      {workspace !== "admin" ? (
        <Button asChild className="h-10 w-full rounded-lg text-sm font-semibold">
          <Link href="/payment/create" onClick={onNavigate}>
            <PlusIcon className="size-4.5" />
            Tạo link bán hàng
          </Link>
        </Button>
      ) : null}

      <nav
        aria-label={
          workspace === "admin"
            ? "Điều hướng quản trị"
            : workspace === "staff"
              ? "Điều hướng nhân viên bán hàng"
              : "Điều hướng đối tác"
        }
        className="flex flex-col gap-4"
      >
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {section.label}
            </span>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href, item.exact);
              const count = item.badge ? badges?.[item.badge] ?? 0 : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-xs"
                      : "font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "" : "text-sidebar-muted")} />
                  <span className="truncate">{item.label}</span>
                  {count > 0 ? (
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-admin-chip px-1.5 text-xs font-semibold text-admin-chip-foreground">
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {footer ? <div className="mt-auto pt-2">{footer}</div> : null}
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside
      data-workspace={props.workspace}
      className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block"
    >
      <SidebarContent {...props} />
    </aside>
  );
}
