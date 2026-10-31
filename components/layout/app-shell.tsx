import type { NavBadgeKey, Workspace } from "./nav";
import { Sidebar, type ShellIdentity } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Khung chung của hai không gian. Mỗi không gian có layout riêng
 * (app/(portal)/layout.tsx, app/admin/layout.tsx) tự kiểm tra quyền rồi dựng khung này.
 */
export function AppShell({
  workspace,
  identity,
  canSwitch,
  badges,
  avatarUserId,
  sidebarFooter,
  children,
}: {
  workspace: Workspace;
  identity: ShellIdentity;
  canSwitch: boolean;
  badges?: Partial<Record<NavBadgeKey, number>>;
  avatarUserId?: string;
  sidebarFooter?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-workspace={workspace} className="flex min-h-screen bg-background">
      <Sidebar
        workspace={workspace}
        identity={identity}
        canSwitch={canSwitch}
        badges={badges}
        footer={sidebarFooter}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          workspace={workspace}
          identity={identity}
          canSwitch={canSwitch}
          badges={badges}
          avatarUserId={avatarUserId}
        />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
