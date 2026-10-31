import { AppShell } from "@/components/layout/app-shell";
import { requirePortalSession, sessionDisplayName } from "@/lib/auth/session";
import { contractTierTitle, PARTNER_TYPE_LABELS } from "@/lib/commission";
import { getPartnerSummary, getPortalAffiliation, getPortalContract } from "@/lib/data/portal";
import { formatMonthStart } from "@/lib/utils/month";

/**
 * Cổng bán hàng: đối tác ký hợp đồng (thấy cả nhân viên, thu nhập) hoặc nhân viên của đối
 * tác (chỉ link, khách, doanh số của chính mình). Mọi trang bên trong chỉ hiển thị dữ liệu
 * của người đang đăng nhập, kể cả khi người đó là quản lý (toàn hệ thống nằm ở /admin).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { session, partnerId, role } = await requirePortalSession();
  const { email, avatarUserId } = session.user;
  const summary = await getPartnerSummary(partnerId);

  let roleLabel: string;
  if (role === "staff") {
    const affiliation = await getPortalAffiliation(partnerId);
    roleLabel = affiliation
      ? affiliation.isActive
        ? `Nhân viên · ${affiliation.partnerName}`
        : "Đã ngừng ghi nhận"
      : "Nhân viên bán hàng";
  } else if (summary?.partnerType === "sales_employee") {
    roleLabel = PARTNER_TYPE_LABELS.sales_employee;
  } else {
    const contract = await getPortalContract(partnerId);
    roleLabel =
      contract.tier === "normal" || !contract.effectiveMonth
        ? contractTierTitle(contract.tier)
        : `${contractTierTitle(contract.tier)} · từ ${formatMonthStart(contract.effectiveMonth)}`;
  }

  return (
    <AppShell
      workspace={role}
      identity={{
        name: summary?.fullName || sessionDisplayName(session),
        email: email ?? "",
        roleLabel,
      }}
      canSwitch={session.user.role === "admin"}
      avatarUserId={avatarUserId ?? undefined}
    >
      {children}
    </AppShell>
  );
}
