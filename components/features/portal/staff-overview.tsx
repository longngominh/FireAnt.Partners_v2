import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelLink, StatCard } from "@/components/shared/panel";
import { StatusBadge } from "@/components/features/payment/status-badge";
import { StaffEndedNotice } from "@/components/features/staff/staff-ended-notice";
import { listCoupons } from "@/lib/data/payment";
import { listCustomers } from "@/lib/data/customers";
import { getOwnSalesMonths } from "@/lib/data/partner-portal";
import { getLinkStats, type PartnerSummary } from "@/lib/data/portal";
import type { StaffAffiliation } from "@/lib/data/staff";
import { formatNumber, formatShortVND } from "@/lib/utils/currency";
import { currentMonthKey, formatDay, formatMonthLabel, parseMonthKey, toMonthKey } from "@/lib/utils/month";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
}

/** Quý trước tháng hiện tại: các MonthKey và nhãn "quý 3/2026". */
function previousQuarter(month: string): { months: string[]; label: string } {
  const { year, month: m } = parseMonthKey(month);
  const q = Math.floor((m - 1) / 3); // 0..3, quý hiện tại
  const prevQ = q === 0 ? 3 : q - 1;
  const prevYear = q === 0 ? year - 1 : year;
  const months = [1, 2, 3].map((i) => toMonthKey(new Date(prevYear, prevQ * 3 + i - 1, 1)));
  return { months, label: `quý ${prevQ + 1}/${prevYear}` };
}

/** Tổng quan của nhân viên bán hàng: chỉ doanh số, link và khách của chính mình. */
export async function StaffOverview({
  summary,
  name,
  affiliation,
}: {
  summary: PartnerSummary;
  name: string;
  affiliation: StaffAffiliation | null;
}) {
  const staffId = summary.partnerId;
  const month = currentMonthKey();
  const { month: monthNumber } = parseMonthKey(month);
  const quarter = previousQuarter(month);
  const [months, links, recent, customers] = await Promise.all([
    getOwnSalesMonths(staffId, month, 6),
    getLinkStats(staffId),
    listCoupons({ partnerId: staffId, page: 1, pageSize: 5 }),
    listCustomers({ partnerId: staffId, page: 1, pageSize: 5 }),
  ]);
  const quarterMonths = await getOwnSalesMonths(staffId, quarter.months[2], 3);
  const current = months[months.length - 1].breakdown;
  const quarterRevenue = quarterMonths.reduce((sum, m) => sum + m.breakdown.total.revenue, 0);
  const active = affiliation?.isActive === true;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Nhân viên" className="flex flex-wrap items-center gap-5 rounded-2xl border bg-card p-6 shadow-xs">
        <span className="flex size-15 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-bold">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-[26px]">{name}</h1>
            {affiliation ? (
              <span className="inline-flex h-7 items-center rounded-full border bg-muted px-2.5 text-[13px] font-semibold">
                Nhân viên bán hàng của {affiliation.partnerName}
              </span>
            ) : null}
          </div>
          <span className="text-sm leading-6 text-muted-foreground">
            {affiliation
              ? active
                ? `Được ghi nhận cho đối tác ${affiliation.partnerName} từ ${formatDay(affiliation.startDate)}. Doanh số qua link của bạn được tính vào doanh thu của đối tác.`
                : `Ghi nhận cho đối tác ${affiliation.partnerName} từ ${formatDay(affiliation.startDate)} tới ${formatDay(affiliation.endDate)}.`
              : "Tài khoản chưa được ghi nhận cho đối tác nào."}
          </span>
        </div>
        {active ? (
          <Button asChild className="h-10 gap-2">
            <Link href="/payment/create">
              <PlusIcon className="size-4" />
              Tạo link bán hàng
            </Link>
          </Button>
        ) : null}
      </section>

      {affiliation && !active ? <StaffEndedNotice partnerName={affiliation.partnerName} endDate={affiliation.endDate} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Doanh số của tôi · tháng ${monthNumber}`}
          value={formatShortVND(current.total.revenue)}
          hint={`${formatNumber(current.total.orders)} đơn đã thanh toán`}
          href="/sales"
        />
        <StatCard
          label="Khách mới"
          value={formatNumber(current.new.customers)}
          hint="Khách mua gói hội viên lần đầu"
        />
        <StatCard
          label="Link chờ thanh toán"
          value={formatNumber(links.pending)}
          tone={links.pending > 0 ? "warning" : "default"}
          href="/payment?status=PENDING"
          hint={links.nextExpiry ? `Link sớm nhất hết hạn ngày ${formatDay(links.nextExpiry)}` : "Không có link nào đang chờ"}
        />
        <StatCard
          label={`Doanh số ${quarter.label}`}
          value={formatShortVND(quarterRevenue)}
          hint={quarter.months.map((m) => `T${parseMonthKey(m).month}`).join(", ")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-3" title="Link gần đây của tôi" actions={<PanelLink href="/payment">Tất cả link</PanelLink>}>
          {recent.rows.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Bạn chưa tạo link nào.</p>
          ) : (
            <ul className="flex flex-col">
              {recent.rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 border-t py-2.5 first:border-t-0">
                  <span className="flex min-w-0 flex-1 basis-48 flex-col">
                    <span className="font-mono text-[13px] font-semibold">{c.code}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.customerName ?? c.userName ?? "Chưa có khách"} · {c.packageName ?? "—"}
                    </span>
                  </span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="lg:col-span-2" title="Khách hàng của tôi" actions={<PanelLink href="/customers">Tất cả</PanelLink>}>
          {customers.rows.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Chưa có khách thanh toán qua link của bạn.</p>
          ) : (
            <ul className="flex flex-col">
              {customers.rows.map((c) => (
                <li key={c.username} className="flex items-center gap-3 border-t py-2.5 first:border-t-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{c.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.latestPackage ?? "—"} · {formatDay(c.lastOrderAt)}
                    </span>
                  </span>
                  <span className="num text-sm font-semibold">{formatShortVND(c.totalSpent)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Doanh số 6 tháng của tôi"
        description="Chỉ tính đơn thanh toán qua link của bạn"
        actions={<PanelLink href="/sales">Chi tiết giao dịch</PanelLink>}
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-2.5 font-semibold">Tháng</th>
                <th className="px-3 py-2.5 text-right font-semibold">Đơn</th>
                <th className="px-3 py-2.5 text-right font-semibold">Khách mới</th>
                <th className="px-5 py-2.5 text-right font-semibold">Doanh số</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month} className="border-t">
                  <td className="px-5 py-3 font-medium">{formatMonthLabel(m.month)}</td>
                  <td className="num px-3 py-3 text-right">{m.breakdown.total.orders ? formatNumber(m.breakdown.total.orders) : "—"}</td>
                  <td className="num px-3 py-3 text-right">{m.breakdown.new.customers ? formatNumber(m.breakdown.new.customers) : "—"}</td>
                  <td className="num px-5 py-3 text-right font-semibold">
                    {m.breakdown.total.revenue ? formatShortVND(m.breakdown.total.revenue) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
