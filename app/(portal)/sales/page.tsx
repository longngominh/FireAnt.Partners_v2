import { InfoIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, StatCard } from "@/components/shared/panel";
import { MonthPicker } from "@/components/features/revenue/month-picker";
import { SalesStatementButton } from "@/components/features/staff/sales-statement-button";
import { requireStaffSession } from "@/lib/auth/session";
import { getOwnSalesMonths } from "@/lib/data/partner-portal";
import { getPortalAffiliation } from "@/lib/data/portal";
import { listClassifiedOrders, ORDER_KIND_LABELS, otherRevenue } from "@/lib/data/revenue-breakdown";
import { cn } from "@/lib/utils";
import { formatNumber, formatShortVND, formatVND } from "@/lib/utils/currency";
import {
  currentMonthKey,
  formatDay,
  formatMonthLabel,
  monthRange,
  normalizeMonthKey,
  parseMonthKey,
} from "@/lib/utils/month";

export const metadata = { title: "Doanh số của tôi" };

export default async function StaffSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { partnerId } = await requireStaffSession();
  const params = await searchParams;
  const now = currentMonthKey();
  const month = normalizeMonthKey(params.month);
  const { month: monthNumber } = parseMonthKey(month);
  const { start, end } = monthRange(month);
  const [affiliation, months, orders] = await Promise.all([
    getPortalAffiliation(partnerId),
    getOwnSalesMonths(partnerId, now, 6),
    listClassifiedOrders({ start, end, sellerId: partnerId }),
  ]);
  const selected = (await getOwnSalesMonths(partnerId, month, 1))[0].breakdown;
  const partnerName = affiliation?.partnerName ?? "đối tác";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Doanh số của tôi"
        description={`Đơn đã thanh toán qua link của bạn. Doanh số trong thời gian bạn được ghi nhận tính vào doanh thu của đối tác ${partnerName}.`}
        actions={
          <>
            <MonthPicker month={month} basePath="/sales" />
            <SalesStatementButton
              filename={`bang-ke-doanh-so-${month}.csv`}
              rows={orders.map((o) => ({
                date: formatDay(o.orderDate),
                code: o.couponCode ?? "",
                customer: o.customerUserName ?? "",
                packageName: o.packageName ?? "",
                kind: ORDER_KIND_LABELS[o.kind],
                amount: o.amount,
              }))}
            />
          </>
        }
      />

      <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3">
        <InfoIcon className="mt-0.5 size-5 shrink-0 text-primary" />
        <span className="text-sm leading-6">
          <strong className="font-semibold">Thu nhập của bạn do đối tác {partnerName} chi trả</strong> theo thỏa thuận giữa hai
          bên. FireAnt không lưu tỷ lệ này nên trang chỉ hiện doanh số. Dùng nút “Tải bảng kê” để đối chiếu với đối tác.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Doanh số tháng ${monthNumber}`}
          value={formatShortVND(selected.total.revenue)}
          hint={`${formatNumber(selected.total.orders)} đơn đã thanh toán`}
        />
        <StatCard
          label="Từ khách mới"
          value={formatShortVND(selected.new.revenue)}
          hint={`${formatNumber(selected.new.customers)} khách mua gói hội viên lần đầu`}
        />
        <StatCard
          label="Gia hạn và nâng cấp"
          value={formatShortVND(selected.renewal.revenue + selected.upgrade.revenue)}
          hint={`${formatNumber(selected.renewal.orders + selected.upgrade.orders)} đơn của khách đã có gói`}
        />
        <StatCard
          label="Khóa học và khác"
          value={formatShortVND(selected.course.revenue + selected.other.revenue)}
          hint={`${formatNumber(selected.course.orders + selected.other.orders)} đơn`}
        />
      </div>

      <Panel
        title={`Giao dịch ${formatMonthLabel(month).toLowerCase()}`}
        description={month === now ? `Tạm tính tới ${formatDay(new Date())} · đơn chờ thanh toán chưa có trong bảng` : undefined}
        flush
      >
        {orders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Chưa có đơn thanh toán nào trong tháng.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">Ngày thanh toán</th>
                  <th className="px-3 py-2.5 font-semibold">Mã link</th>
                  <th className="px-3 py-2.5 font-semibold">Khách</th>
                  <th className="px-3 py-2.5 font-semibold">Gói</th>
                  <th className="px-3 py-2.5 font-semibold">Loại đơn</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderId} className="border-t">
                    <td className="num px-5 py-2.5">{formatDay(o.orderDate)}</td>
                    <td className="px-3 py-2.5 font-mono text-[13px] font-semibold">{o.couponCode ?? "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5">{o.customerUserName ?? "—"}</td>
                    <td className="px-3 py-2.5 text-foreground/80">{o.packageName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex h-5.5 items-center rounded-full border px-2 text-xs font-semibold",
                          o.kind === "new" ? "border-success/30 bg-success/10 text-success" : "bg-muted text-foreground/80",
                        )}
                      >
                        {ORDER_KIND_LABELS[o.kind]}
                      </span>
                    </td>
                    <td className="num px-5 py-2.5 text-right font-semibold">{formatVND(o.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30 font-bold">
                  <td className="px-5 py-3" colSpan={5}>
                    Tổng · {orders.length} đơn
                  </td>
                  <td className="num px-5 py-3 text-right">{formatVND(orders.reduce((sum, o) => sum + o.amount, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Doanh số theo tháng" description="Chỉ gồm đơn thanh toán qua link của bạn" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="bg-muted/40 text-xs text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-semibold">Tháng</th>
                <th className="px-3 py-2.5 text-right font-semibold">Đơn</th>
                <th className="px-3 py-2.5 text-right font-semibold">Khách mới</th>
                <th className="px-3 py-2.5 text-right font-semibold">DS khách mới</th>
                <th className="px-3 py-2.5 text-right font-semibold">DS gia hạn, khác</th>
                <th className="px-5 py-2.5 text-right font-semibold">Tổng doanh số</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month} className={cn("border-t", m.month === month && "bg-primary/5")}>
                  <td className="px-5 py-2.5 font-medium">{formatMonthLabel(m.month)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatNumber(m.breakdown.total.orders)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatNumber(m.breakdown.new.customers)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatShortVND(m.breakdown.new.revenue)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatShortVND(otherRevenue(m.breakdown))}</td>
                  <td className="num px-5 py-2.5 text-right font-semibold">{formatShortVND(m.breakdown.total.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
