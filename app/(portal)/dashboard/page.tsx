import { PartnerOverview } from "@/components/features/portal/partner-overview";
import { StaffOverview } from "@/components/features/portal/staff-overview";
import { requirePortalSession, sessionDisplayName } from "@/lib/auth/session";
import { getPartnerSummary, getPortalAffiliation } from "@/lib/data/portal";

export const metadata = { title: "Tổng quan" };

export default async function DashboardPage() {
  const { session, partnerId, role } = await requirePortalSession();
  const summary = await getPartnerSummary(partnerId);
  if (!summary) {
    return <p className="text-sm text-muted-foreground">Không tải được thông tin tài khoản. Hãy thử tải lại trang.</p>;
  }
  const name = summary.fullName || sessionDisplayName(session);

  if (role === "staff") {
    const affiliation = await getPortalAffiliation(partnerId);
    return <StaffOverview summary={summary} name={name} affiliation={affiliation} />;
  }
  return <PartnerOverview summary={summary} name={name} />;
}
