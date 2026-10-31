import Link from "next/link";
import { Suspense } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { CouponTable } from "@/components/features/payment/coupon-table";
import { FilterBar } from "@/components/features/payment/filter-bar";
import { PendingAccountBanner } from "@/components/features/payment/pending-account-banner";
import { requireAdminSession } from "@/lib/auth/session";
import { listPartners } from "@/lib/data/partners";
import { listCoupons, listCouponSources, type CouponStatus } from "@/lib/data/payment";

export const metadata = { title: "Link thanh toán" };

type SearchParams = Promise<{
  q?: string;
  status?: string;
  source?: string;
  partner?: string;
  page?: string;
}>;

export default async function AdminLinksPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminSession();
  const params = await searchParams;

  const page = Number(params.page ?? "1") || 1;
  const status = (params.status ?? "ALL") as CouponStatus | "ALL";
  const partnerId = Number(params.partner);
  const partnerFilter = Number.isInteger(partnerId) && partnerId > 0 ? partnerId : null;

  const [{ rows, total, pageSize }, sources, partners] = await Promise.all([
    // Lọc theo đối tác: gồm cả link nhân viên tạo trong thời gian được ghi nhận.
    listCoupons({
      teamOf: partnerFilter,
      status,
      q: params.q ?? "",
      source: params.source ?? null,
      page,
      pageSize: 20,
    }),
    listCouponSources(null, partnerFilter),
    listPartners(),
  ]);

  const labels = Object.fromEntries(
    partners.map((p) => [p.id, p.isStaff ? `${p.name ?? p.username} · nhân viên` : (p.name ?? p.username)]),
  );
  const options = partners
    .filter((p) => !p.isStaff)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || (a.name ?? a.username).localeCompare(b.name ?? b.username, "vi"))
    .map((p) => ({ id: p.id, label: `${p.name ?? p.username}${p.isActive ? "" : " (tạm dừng)"}` }));
  const filtered = partnerFilter !== null ? labels[partnerFilter] : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Link thanh toán"
        description={
          filtered
            ? `${total} link của ${filtered} và nhân viên. Bỏ lọc đối tác để xem toàn hệ thống.`
            : `${total} link của mọi đối tác và nhân viên. Lọc theo đối tác, trạng thái hoặc nguồn khách.`
        }
        actions={
          <Button asChild className="h-10 gap-2 px-4">
            <Link href={partnerFilter !== null ? `/admin/links/new?partner=${partnerFilter}` : "/admin/links/new"}>
              <PlusIcon className="size-4" />
              Tạo link hộ
            </Link>
          </Button>
        }
      />

      <Suspense fallback={null}>
        <PendingAccountBanner partnerId={null} teamOf={partnerFilter} href="/admin/pending-accounts" />
      </Suspense>

      <FilterBar sources={sources} partners={options} />

      <CouponTable rows={rows} partnerLabels={labels} sellerHeader="Người tạo" />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/admin/links"
        searchParams={{ q: params.q, status: params.status, source: params.source, partner: params.partner }}
      />
    </div>
  );
}
