import Link from "next/link";
import { Suspense } from "react";
import { PlusIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { CouponTable } from "@/components/features/payment/coupon-table";
import { FilterBar } from "@/components/features/payment/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { listCoupons, listCouponSources } from "@/lib/data/payment";
import type { CouponStatus } from "@/lib/data/payment";
import { PendingAccountBanner } from "@/components/features/payment/pending-account-banner";

export const metadata = { title: "Link thanh toán đã tạo" };

type SearchParams = Promise<{
  q?: string;
  status?: string;
  source?: string;
  page?: string;
}>;

export default async function PaymentListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const params = await searchParams;
  const isAdmin = session?.user.role === "admin";

  const page = Number(params.page ?? "1") || 1;
  const status = (params.status ?? "ALL") as CouponStatus | "ALL";
  const partnerId = isAdmin ? null : session?.user.partnerId ?? null;
  const [{ rows, total, pageSize }, sources] = await Promise.all([
    listCoupons({
      partnerId,
      status,
      q: params.q ?? "",
      source: params.source ?? null,
      page,
      pageSize: 20,
    }),
    isAdmin || partnerId ? listCouponSources(partnerId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Link thanh toán đã tạo</h1>
          <p className="text-sm text-muted-foreground">
            Tổng {total} link. Bấm để xem QR và copy link nhanh.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/payment/create">
            <PlusIcon className="size-4" />
            Tạo link mới
          </Link>
        </Button>
      </div>

      {/* Đếm phải hỏi linked server NEWFA — để trong Suspense cho bảng hiện ra ngay. */}
      <Suspense fallback={null}>
        <PendingAccountBanner partnerId={partnerId} />
      </Suspense>

      <FilterBar sources={sources} />

      <CouponTable rows={rows} />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/payment"
        searchParams={{ q: params.q, status: params.status, source: params.source }}
      />
    </div>
  );
}
