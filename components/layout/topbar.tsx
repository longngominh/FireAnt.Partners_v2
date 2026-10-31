import Link from "next/link";
import { Building2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MobileNav } from "./mobile-nav";
import type { NavBadgeKey, Workspace } from "./nav";
import type { ShellIdentity } from "./sidebar";
import { UserMenu } from "./user-menu";

export function Topbar({
  workspace,
  identity,
  canSwitch,
  badges,
  avatarUserId,
}: {
  workspace: Workspace;
  identity: ShellIdentity;
  canSwitch: boolean;
  badges?: Partial<Record<NavBadgeKey, number>>;
  avatarUserId?: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md md:px-8">
      <MobileNav workspace={workspace} identity={identity} canSwitch={canSwitch} badges={badges} />

      {workspace === "admin" ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-admin-chip px-2 py-1 text-xs font-semibold text-admin-chip-foreground">
          <Building2Icon className="size-3.5" />
          Bảng quản trị FireAnt
        </span>
      ) : (
        <span className="hidden text-sm font-medium text-muted-foreground md:inline">
          {workspace === "staff" ? "Cổng nhân viên bán hàng" : "Cổng đối tác"}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        {workspace !== "admin" ? (
          <Button asChild size="sm" className="h-9 gap-1.5 px-3 md:hidden">
            <Link href="/payment/create">
              <PlusIcon className="size-4" />
              Tạo link
            </Link>
          </Button>
        ) : null}
        <ThemeToggle />
        <UserMenu identity={identity} avatarUserId={avatarUserId} />
      </div>
    </header>
  );
}
