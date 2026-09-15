import Link from "next/link";
import { PlusIcon, UserRoundXIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { CouponTable } from "@/components/features/payment/coupon-table";
import { FilterBar } from "@/components/features/payment/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { listCoupons } from "@/lib/data/payment";
import type { CouponStatus } from "@/lib/data/payment";
import { countPaidOrdersWithoutAccount } from "@/lib/data/pending-accounts";

export const metadata = { title: "Link thanh toán đã tạo" };

type SearchParams = Promise<{
  q?: string;
  status?: string;
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
  const [{ rows, total, pageSize }, pendingAccountCount] = await Promise.all([
    listCoupons({ partnerId, status, q: params.q ?? "", page, pageSize: 20 }),
    countPaidOrdersWithoutAccount(partnerId),
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

      {pendingAccountCount > 0 ? (
        <Link
          href="/payment/pending-account"
          className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm transition-colors hover:bg-warning/15"
        >
          <UserRoundXIcon className="size-4 shrink-0 text-warning" />
          <span className="min-w-0">
            <strong className="font-semibold">{pendingAccountCount} đơn đã thu tiền</strong> có email chưa được
            đăng ký tài khoản FireAnt — khách chưa dùng được gói. Bấm để xem và nhắc khách đăng ký.
          </span>
        </Link>
      ) : null}

      <FilterBar />

      <CouponTable rows={rows} />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/payment"
        searchParams={{ q: params.q, status: params.status }}
      />
    </div>
  );
}
