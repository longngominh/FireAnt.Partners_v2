import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/shared/pagination";
import { StatCard } from "@/components/shared/panel";
import { PendingAccountTable } from "@/components/features/payment/pending-account-table";
import { listPaidOrdersWithoutAccount } from "@/lib/data/pending-accounts";
import { formatNumber, formatVND } from "@/lib/utils/currency";

/**
 * Danh sách đơn đã thanh toán mà email khách chưa có tài khoản FireAnt.
 * partnerId = người đang đăng nhập, teamOf = đối tác (gồm đơn của nhân viên),
 * cả hai null = toàn hệ thống (bảng quản trị).
 */
export async function PendingAccountsView({
  partnerId,
  teamOf = null,
  basePath,
  q,
  page,
}: {
  partnerId: number | null;
  teamOf?: number | null;
  basePath: string;
  q: string;
  page: number;
}) {
  const { rows, total, pageSize } = await listPaidOrdersWithoutAccount({
    partnerId,
    teamOf,
    q,
    page,
    pageSize: 20,
  });
  const pendingAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="flex flex-col gap-5">
      {total > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
          <StatCard label="Đơn chờ tài khoản" value={formatNumber(total)} tone="warning" />
          <StatCard label="Giá trị (trang này)" value={formatVND(pendingAmount)} />
        </div>
      ) : null}

      <form action={basePath} className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q}
          placeholder="Tìm theo email khách hoặc mã coupon…"
          className="h-10 pl-9"
          aria-label="Tìm đơn"
        />
      </form>

      {rows.length === 0 && !q ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-14 text-center">
          <p className="text-sm font-semibold">Không có đơn nào chờ tài khoản</p>
          <p className="max-w-md text-[13px] leading-5 text-muted-foreground">
            Khi khách thanh toán bằng email chưa có tài khoản FireAnt, đơn sẽ nằm ở đây để bạn tạo tài khoản hộ khách.
          </p>
        </div>
      ) : (
        <PendingAccountTable rows={rows} showPartner={partnerId === null} />
      )}

      <Pagination page={page} pageSize={pageSize} total={total} basePath={basePath} searchParams={{ q: q || undefined }} />
    </div>
  );
}
