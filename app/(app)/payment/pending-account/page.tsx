import Link from "next/link";
import { SearchIcon, TicketIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/shared/pagination";
import { PendingAccountTable } from "@/components/features/payment/pending-account-table";
import { listPaidOrdersWithoutAccount } from "@/lib/data/pending-accounts";
import { formatVND } from "@/lib/utils/currency";

export const metadata = { title: "Đơn chờ tài khoản" };

type SearchParams = Promise<{ q?: string; page?: string }>;

export default async function PendingAccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const isAdmin = session?.user.role === "admin";

  const page = Number(params.page ?? "1") || 1;
  const { rows, total, pageSize } = await listPaidOrdersWithoutAccount({
    partnerId: isAdmin ? null : session?.user.partnerId ?? null,
    q: params.q ?? "",
    page,
    pageSize: 20,
  });

  const pendingAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Đơn chờ tài khoản</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Khách đã thanh toán nhưng email trên đơn chưa có tài khoản FireAnt. Gói chỉ có hiệu lực khi khách
            đăng ký bằng <strong>đúng email đó</strong> — hãy nhắc khách đăng ký. Đơn tự rời khỏi danh sách
            ngay khi tài khoản được tạo.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/payment">
            <TicketIcon className="size-4" />
            Link đã tạo
          </Link>
        </Button>
      </div>

      {total > 0 ? (
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Đơn chờ
            </span>
            <span className="num text-2xl font-bold tracking-tight">{total}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Giá trị (trang này)
            </span>
            <span className="num text-2xl font-bold tracking-tight text-primary">
              {formatVND(pendingAmount)}
            </span>
          </div>
        </Card>
      ) : null}

      <form action="/payment/pending-account" className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Tìm theo email khách hoặc mã coupon…"
          className="pl-9"
        />
      </form>

      <PendingAccountTable rows={rows} showPartner={isAdmin} />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        basePath="/payment/pending-account"
        searchParams={{ q: params.q }}
      />
    </div>
  );
}
