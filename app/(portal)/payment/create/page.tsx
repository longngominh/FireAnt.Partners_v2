import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import {
  CreatePaymentWorkspace,
  type CreateMode,
} from "@/components/features/payment/create-payment-workspace";
import { StaffEndedNotice } from "@/components/features/staff/staff-ended-notice";
import { requirePortalSession } from "@/lib/auth/session";
import { contractTierScheme } from "@/lib/commission";
import { listPackages } from "@/lib/data/packages";
import { listCouponSources } from "@/lib/data/payment";
import { getPortalAffiliation, getPortalContract } from "@/lib/data/portal";
import { sourceSuggestions } from "@/lib/payment/source";

export const metadata = { title: "Tạo link bán hàng" };

type SearchParams = Promise<{ mode?: string }>;

export default async function CreatePaymentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Link luôn ghi cho người đang đăng nhập (đối tác hoặc nhân viên). Quản lý tạo hộ ở /admin/links/new.
  const [{ partnerId, role }, params] = await Promise.all([requirePortalSession(), searchParams]);
  const isStaff = role === "staff";
  const [packages, usedSources, affiliation, contract] = await Promise.all([
    listPackages(),
    listCouponSources(partnerId),
    isStaff ? getPortalAffiliation(partnerId) : Promise.resolve(null),
    isStaff ? Promise.resolve(null) : getPortalContract(partnerId),
  ]);
  const defaultMode: CreateMode = params.mode === "upgrade" ? "upgrade" : "purchase";
  const blocked = isStaff && !affiliation?.isActive;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tạo link bán hàng"
        description={
          isStaff
            ? `Một bước tạo đơn, link rút gọn và QR chuyển khoản; gói kích hoạt tự động khi khách thanh toán. Đơn thanh toán qua link này ghi nhận cho bạn${
                affiliation ? ` và tính vào doanh thu của đối tác ${affiliation.partnerName}` : ""
              }.`
            : `Một bước tạo đơn, link rút gọn và QR chuyển khoản; gói kích hoạt tự động khi khách thanh toán. Khi nhập tài khoản khách, hệ thống báo ngay đơn là khách mới hay gia hạn${
                contract && contract.tier !== "normal"
                  ? ` — ${contractTierScheme(contract.tier)} chỉ tính phí/thù lao trên đơn khách mới`
                  : ""
              }.`
        }
        actions={
          <Button asChild variant="outline" className="h-10 gap-2">
            <Link href="/payment">
              <LinkIcon className="size-4" />
              Link đã tạo
            </Link>
          </Button>
        }
      />

      {blocked ? (
        affiliation ? (
          <StaffEndedNotice partnerName={affiliation.partnerName} endDate={affiliation.endDate} />
        ) : (
          <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            Tài khoản chưa được ghi nhận cho đối tác nào nên chưa tạo được link.
          </p>
        )
      ) : (
        <CreatePaymentWorkspace
          packages={packages}
          isAdmin={false}
          partners={[]}
          sessionPartnerId={String(partnerId)}
          defaultMode={defaultMode}
          sourceSuggestions={sourceSuggestions(usedSources)}
        />
      )}
    </div>
  );
}
