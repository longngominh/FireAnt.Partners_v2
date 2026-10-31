import { PageHeader } from "@/components/shared/page-header";
import { CustomersView } from "@/components/features/customers/customers-view";
import { requirePortalSession } from "@/lib/auth/session";
import { getPortalAffiliation } from "@/lib/data/portal";
import { getSellerLabels } from "@/lib/data/staff";
import { formatDay } from "@/lib/utils/month";

export const metadata = { title: "Khách hàng" };

type SearchParams = Promise<{ q?: string; source?: string; page?: string }>;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ partnerId, role }, params] = await Promise.all([requirePortalSession(), searchParams]);
  const isStaff = role === "staff";
  const [sellerLabels, affiliation] = await Promise.all([
    isStaff ? Promise.resolve(undefined) : getSellerLabels(partnerId),
    isStaff ? getPortalAffiliation(partnerId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isStaff ? "Khách hàng của tôi" : "Khách hàng"}
        description={
          isStaff
            ? `Khách đã thanh toán qua link của bạn${
                affiliation ? ` kể từ ngày bạn trực thuộc đối tác ${affiliation.partnerName} (${formatDay(affiliation.startDate)})` : ""
              }. Khách của nhân viên khác không hiện ở đây.`
            : "Khách đã thanh toán qua link của bạn và của nhân viên, tổng đơn và chi tiêu theo từng khách."
        }
      />
      <CustomersView
        partnerId={isStaff ? partnerId : null}
        teamOf={isStaff ? null : partnerId}
        sellerLabels={sellerLabels && Object.keys(sellerLabels).length > 1 ? sellerLabels : undefined}
        basePath="/customers"
        q={params.q ?? ""}
        source={params.source ?? null}
        page={Number(params.page ?? "1") || 1}
      />
    </div>
  );
}
