import Link from "next/link";
import { Suspense } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { CouponTable } from "@/components/features/payment/coupon-table";
import { FilterBar } from "@/components/features/payment/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { StaffEndedNotice } from "@/components/features/staff/staff-ended-notice";
import { requirePortalSession } from "@/lib/auth/session";
import { listCoupons, listCouponSources } from "@/lib/data/payment";
import type { CouponStatus } from "@/lib/data/payment";
import { getPortalAffiliation, partnerDisplayName } from "@/lib/data/portal";
import { getSellerLabels } from "@/lib/data/staff";
import { PendingAccountBanner } from "@/components/features/payment/pending-account-banner";

export const metadata = { title: "Link bán hàng" };

type SearchParams = Promise<{
  q?: string;
  status?: string;
  source?: string;
  page?: string;
  /** Đối tác xem link của một nhân viên. */
  seller?: string;
}>;

export default async function PaymentListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Cổng bán hàng chỉ xem link của mình (đối tác: kèm link nhân viên) — toàn hệ thống ở /admin/links.
  const { partnerId, role } = await requirePortalSession();
  const params = await searchParams;
  const isStaff = role === "staff";
  const sellerLabels = isStaff ? undefined : await getSellerLabels(partnerId);
  const sellerParam = Number(params.seller);
  // Chỉ lọc theo người bán nằm trong nhân viên của chính đối tác.
  const seller =
    !isStaff && Number.isInteger(sellerParam) && sellerParam !== partnerId && sellerLabels?.[sellerParam]
      ? sellerParam
      : null;
  const teamOf = isStaff ? null : partnerId;
  const scope = isStaff ? partnerId : seller;

  const page = Number(params.page ?? "1") || 1;
  const status = (params.status ?? "ALL") as CouponStatus | "ALL";
  const [{ rows, total, pageSize }, sources, affiliation] = await Promise.all([
    listCoupons({
      partnerId: scope,
      teamOf,
      status,
      q: params.q ?? "",
      source: params.source ?? null,
      page,
      pageSize: 20,
    }),
    listCouponSources(scope, teamOf),
    isStaff ? getPortalAffiliation(partnerId) : Promise.resolve(null),
  ]);
  const canCreate = !isStaff || affiliation?.isActive === true;
  const hasStaff = sellerLabels !== undefined && Object.keys(sellerLabels).length > 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isStaff ? "Link bán hàng của tôi" : "Link bán hàng"}
        description={
          isStaff
            ? `Chỉ gồm link do bạn tạo (${total} link). Đơn thanh toán qua các link này ghi nhận cho bạn${
                affiliation ? ` và tính vào doanh thu của đối tác ${affiliation.partnerName}` : ""
              }.`
            : `Tổng ${total} link do bạn${hasStaff ? " và nhân viên" : ""} tạo. Bấm vào từng link để xem QR, copy link hoặc gửi lại cho khách.`
        }
        actions={
          canCreate ? (
            <Button asChild className="h-10 gap-2 px-4">
              <Link href="/payment/create">
                <PlusIcon className="size-4" />
                Tạo link bán hàng
              </Link>
            </Button>
          ) : null
        }
      />

      {seller !== null ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          <span>
            Đang xem link của nhân viên <strong className="font-semibold">{sellerLabels?.[seller]}</strong>.
          </span>
          <Link href="/payment" className="font-semibold text-primary hover:underline">
            Xem tất cả link
          </Link>
        </div>
      ) : null}

      {isStaff && affiliation && !affiliation.isActive ? (
        <StaffEndedNotice partnerName={affiliation.partnerName} endDate={affiliation.endDate} />
      ) : null}

      {/* Đếm phải hỏi linked server NEWFA — để trong Suspense cho bảng hiện ra ngay. */}
      <Suspense fallback={null}>
        <PendingAccountBanner partnerId={scope} teamOf={teamOf} />
      </Suspense>

      <FilterBar sources={sources} />

      <CouponTable
        rows={rows}
        partnerLabels={hasStaff ? sellerLabels : undefined}
        sellerHeader="Người tạo"
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/payment"
        searchParams={{ q: params.q, status: params.status, source: params.source, seller: seller ? String(seller) : undefined }}
      />
      {!isStaff ? null : (
        <p className="text-[13px] leading-5 text-muted-foreground">
          Link hiệu lực 14 ngày kể từ khi tạo. Thu nhập của bạn do{" "}
          {affiliation ? `đối tác ${affiliation.partnerName}` : partnerDisplayName(null)} chi trả theo thỏa thuận giữa hai
          bên.
        </p>
      )}
    </div>
  );
}
