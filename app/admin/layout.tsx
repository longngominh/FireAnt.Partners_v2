import { AppShell } from "@/components/layout/app-shell";
import { requireAdminSession, sessionDisplayName } from "@/lib/auth/session";
import { countStaffApplicationsByStatus } from "@/lib/data/staff";

/**
 * Bảng quản trị FireAnt: dữ liệu toàn hệ thống, chỉ vai trò quản trị.
 * Quản lý kiêm đối tác đổi sang cổng đối tác của mình qua bộ chuyển ở đầu thanh bên.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();
  const { email, partnerId, avatarUserId } = session.user;
  const applications = await countStaffApplicationsByStatus();

  return (
    <AppShell
      workspace="admin"
      identity={{
        name: sessionDisplayName(session),
        email: email ?? "",
        roleLabel: "Quản lý FireAnt",
      }}
      canSwitch={Boolean(partnerId)}
      badges={{ approvals: applications.pending }}
      avatarUserId={avatarUserId ?? undefined}
    >
      {children}
    </AppShell>
  );
}
