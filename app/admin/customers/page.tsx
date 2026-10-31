import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CustomersView } from "@/components/features/customers/customers-view";
import { requireAdminSession } from "@/lib/auth/session";
import { getPartnerSummary, partnerDisplayName } from "@/lib/data/portal";
import { getSellerLabels } from "@/lib/data/staff";

export const metadata = { title: "Khách hàng" };

type SearchParams = Promise<{ q?: string; source?: string; page?: string; partner?: string }>;

export default async function AdminCustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const [, params] = await Promise.all([requireAdminSession(), searchParams]);
  const partnerId = Number(params.partner);
  const summary = Number.isInteger(partnerId) && partnerId > 0 ? await getPartnerSummary(partnerId) : null;
  // Lọc theo đối tác (từ hồ sơ đối tác): gồm khách của nhân viên trong thời gian được ghi nhận.
  const teamOf = summary && !summary.isStaff ? summary.partnerId : null;
  const sellerLabels = teamOf !== null ? await getSellerLabels(teamOf) : undefined;
  if (sellerLabels && teamOf !== null) sellerLabels[teamOf] = "Đối tác";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Khách hàng"
        description={
          teamOf !== null ? (
            <>
              Khách của {partnerDisplayName(summary)} và nhân viên.{" "}
              <Link href="/admin/customers" className="font-semibold text-primary hover:underline">
                Xem toàn hệ thống
              </Link>
            </>
          ) : (
            "Khách đã thanh toán qua link của mọi đối tác và nhân viên, kèm người phụ trách, tổng đơn và chi tiêu."
          )
        }
      />
      <CustomersView
        partnerId={null}
        teamOf={teamOf}
        sellerLabels={sellerLabels}
        basePath="/admin/customers"
        q={params.q ?? ""}
        source={params.source ?? null}
        page={Number(params.page ?? "1") || 1}
        keep={{ partner: teamOf !== null ? String(teamOf) : undefined }}
      />
    </div>
  );
}
