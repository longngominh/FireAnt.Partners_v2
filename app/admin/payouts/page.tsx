import Link from "next/link";
import { Suspense } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HistoryChart, HistoryChartSkeleton, type HistorySeries } from "@/components/shared/history-chart";
import { KpiDelta, KpiDeltaSkeleton } from "@/components/shared/kpi-delta";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/panel";
import { TierBadge, TierDot } from "@/components/features/tiers/tier-ui";
import { ExportCsvButton } from "@/components/features/revenue/export-csv-button";
import { MonthPicker } from "@/components/features/revenue/month-picker";
import { PaymentRequestDialog } from "@/components/features/revenue/payment-request-dialog";
import { requireAdminSession, sessionDisplayName } from "@/lib/auth/session";
import {
  CONTRACT_TIER_LABELS,
  CONTRACT_TIERS,
  contractTierScheme,
  isContractTier,
  usesSplitPolicy,
  type ContractTier,
} from "@/lib/commission";
import { payableAmount } from "@/lib/earnings/explain";
import { getPartnerPaymentInfoMap, missingPaymentFields } from "@/lib/data/partner-payment-info";
import {
  getMonthlyRevenueReport,
  getRecentRevenueRows,
  getRevenueHistory,
  sumMonthlyTotals,
  withLiveMonth,
  type MonthlyPartnerRevenue,
} from "@/lib/data/revenue";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatVND } from "@/lib/utils/currency";
import {
  currentMonthKey,
  formatMonthLabel,
  formatMonthRangeLabel,
  normalizeMonthKey,
  parseMonthKey,
  shiftMonth,
  type MonthKey,
} from "@/lib/utils/month";

export const metadata = { title: "Thù lao & chi trả" };

const BASE_PATH = "/admin/payouts";

type Group = "partner" | "nvkd";

type SearchParams = Promise<{ month?: string; group?: string; tier?: string; missing?: string; q?: string }>;

type PayoutRow = MonthlyPartnerRevenue & {
  /** Tên trên chứng từ (người đứng tên hợp đồng) trước tên tài khoản FireAnt — như giấy đề nghị. */
  displayName: string;
  payable: number;
  bankName: string | null;
  legalType: "individual" | "company";
  /** Có phí/thù lao nhưng thiếu số tài khoản. */
  missing: string[];
};

type GroupSummary = {
  payable: number;
  base: number;
  revenue: number;
  staff: number;
  baseSalary: number;
  /** Số người có phí/thù lao. */
  earners: number;
};

/** Tổng của một nhóm trong một tháng — cùng cách lọc với bảng: chỉ người có doanh số hoặc phí/thù lao. */
function summarize(rows: MonthlyPartnerRevenue[], group: Group): GroupSummary {
  const summary: GroupSummary = { payable: 0, base: 0, revenue: 0, staff: 0, baseSalary: 0, earners: 0 };
  for (const row of rows) {
    if (row.partnerType !== (group === "nvkd" ? "sales_employee" : "collaborator")) continue;
    const payable = payableAmount(row.remuneration);
    if (row.revenue <= 0 && payable <= 0) continue;
    summary.payable += payable;
    summary.base += row.remuneration.revenue;
    summary.revenue += row.revenue;
    summary.staff += row.staffRevenue;
    summary.baseSalary += row.remuneration.baseSalary;
    if (payable > 0) summary.earners += 1;
  }
  return summary;
}

type MonthRows = Promise<Map<MonthKey, MonthlyPartnerRevenue[]>>;

/** So với tháng trước ở đáy thẻ: chỉ cần một tháng nên không chờ cả lịch sử. */
async function GroupDelta({
  previous,
  group,
  month,
  live,
  pick,
  upIsGood,
}: {
  previous: MonthRows;
  group: Group;
  month: MonthKey;
  live: GroupSummary;
  pick: (summary: GroupSummary) => number;
  upIsGood?: boolean;
}) {
  const rows = await previous;
  const prev = summarize(rows.get(shiftMonth(month, -1)) ?? [], group);
  return (
    <KpiDelta
      month={month}
      value={pick(live)}
      previous={pick(prev)}
      open={month === currentMonthKey()}
      upIsGood={upIsGood}
    />
  );
}

/** Lịch sử các chỉ số của nhóm đang xem, từ tháng đầu tiên có đơn qua link. */
async function GroupHistory({
  history,
  group,
  month,
  monthHref,
}: {
  history: MonthRows;
  group: Group;
  month: MonthKey;
  monthHref: (month: MonthKey) => string;
}) {
  const rows = await history;
  const months = Array.from(rows.keys());
  const sums = months.map((m) => summarize(rows.get(m) ?? [], group));
  const values = (pick: (s: GroupSummary) => number) => sums.map(pick);
  const series: HistorySeries[] =
    group === "partner"
      ? [
          { key: "payable", label: "Phí/thù lao đối tác", unit: "vnd", values: values((s) => s.payable), upIsGood: false },
          { key: "base", label: "Doanh thu tính thù lao", unit: "vnd", values: values((s) => s.base) },
          { key: "staff", label: "Doanh thu từ nhân viên", unit: "vnd", values: values((s) => s.staff) },
          { key: "earners", label: "Đối tác có phí/thù lao", unit: "count", values: values((s) => s.earners) },
        ]
      : [
          { key: "payable", label: "Hoa hồng NVKD", unit: "vnd", values: values((s) => s.payable), upIsGood: false },
          { key: "base", label: "Doanh thu tính thù lao", unit: "vnd", values: values((s) => s.base) },
          { key: "salary", label: "Lương cứng", unit: "vnd", values: values((s) => s.baseSalary), upIsGood: false },
        ];
  return (
    <HistoryChart
      // Đổi tab thì dựng lại để chọn lại chỉ số đầu của nhóm.
      key={group}
      months={months}
      series={series}
      selected={month}
      openMonth={currentMonthKey()}
      hrefs={months.map(monthHref)}
    />
  );
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toLocaleUpperCase("vi") ?? "")
    .join("");
}

/**
 * Phí/thù lao từng tháng của người FireAnt chi trả: đối tác (theo phụ lục áp dụng cho tháng,
 * gồm doanh số nhân viên trong thời gian được ghi nhận) và nhân viên kinh doanh của FireAnt.
 * Trang không theo dõi việc chuyển khoản; chỉ nhắc ai còn thiếu thông tin chi trả.
 */
export default async function AdminPayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const month = normalizeMonthKey(params.month);
  const group: Group = params.group === "nvkd" ? "nvkd" : "partner";
  const tierFilter: ContractTier | null = group === "partner" && isContractTier(params.tier) ? params.tier : null;
  const missingOnly = params.missing === "1";
  const q = (params.q ?? "").trim();

  const now = currentMonthKey();
  // Lịch sử và tháng trước chạy song song với bảng kê; thẻ và bảng hiện ngay, biểu đồ stream sau.
  const historyRows = getRevenueHistory();
  const previous = getRecentRevenueRows([shiftMonth(month, -1)]);

  const [report, paymentInfo] = await Promise.all([getMonthlyRevenueReport({ month }), getPartnerPaymentInfoMap()]);
  const history = historyRows.then((rows) => withLiveMonth(rows, month, report.rows));

  const all: PayoutRow[] = report.rows
    .map((row) => {
      const payable = payableAmount(row.remuneration);
      const info = paymentInfo.get(row.partnerId);
      return {
        ...row,
        displayName: info?.fullName || row.name?.trim() || row.username,
        payable,
        bankName: info?.bankName ?? null,
        legalType: info?.legalType ?? "individual",
        missing: payable > 0 ? missingPaymentFields(info) : [],
      };
    })
    // Bảng chi trả: chỉ người phát sinh doanh số hoặc phí/thù lao trong tháng.
    .filter((row) => row.revenue > 0 || row.payable > 0);

  const inGroup = all.filter((r) => (group === "nvkd" ? r.partnerType === "sales_employee" : r.partnerType === "collaborator"));
  const needle = q.toLocaleLowerCase("vi");
  const rows = inGroup
    .filter((r) => {
      if (
        needle &&
        ![r.displayName, r.name, r.email, r.username, r.phone].some((v) => v?.toLocaleLowerCase("vi").includes(needle))
      ) {
        return false;
      }
      if (tierFilter && r.tier !== tierFilter) return false;
      if (missingOnly && r.missing.length === 0) return false;
      return true;
    })
    .sort((a, b) => b.payable - a.payable || b.revenue - a.revenue);
  const totals = sumMonthlyTotals(rows);

  const sum = (list: PayoutRow[], pick: (r: PayoutRow) => number) => list.reduce((s, r) => s + pick(r), 0);
  const live = summarize(report.rows, group);
  const missingCount = inGroup.filter((r) => r.missing.length > 0).length;
  const tierCounts = Object.fromEntries(
    CONTRACT_TIERS.map((t) => [t, inGroup.filter((r) => r.tier === t).length]),
  ) as Record<ContractTier, number>;

  // Giấy đề nghị gồm cả đối tác và NVKD có phí/thù lao (khớp route xuất file, không phụ thuộc tab).
  const requestRows = all.filter((r) => r.remuneration.commission > 0);

  const keep = { group: group === "partner" ? undefined : group, q: q || undefined };
  const href = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams({ month });
    for (const [k, v] of Object.entries({ ...keep, tier: tierFilter ?? undefined, missing: missingOnly ? "1" : undefined, ...overrides })) {
      if (v) sp.set(k, v);
    }
    return `${BASE_PATH}?${sp.toString()}`;
  };
  // Bấm cột lịch sử = đổi tháng như MonthPicker: giữ tab và ô tìm, bỏ bộ lọc phụ lục/thiếu thông tin.
  const monthHref = (m: MonthKey) => {
    const sp = new URLSearchParams({ month: m });
    for (const [k, v] of Object.entries(keep)) if (v) sp.set(k, v);
    return `${BASE_PATH}?${sp.toString()}`;
  };
  const trendOf = (pick: (summary: GroupSummary) => number, upIsGood = true) => (
    <Suspense fallback={<KpiDeltaSkeleton />}>
      <GroupDelta previous={previous} group={group} month={month} live={live} pick={pick} upIsGood={upIsGood} />
    </Suspense>
  );
  const isCurrentMonth = month === now;
  const monthTag = `T${parseMonthKey(month).month}`;
  const partnerCount = all.filter((r) => r.partnerType === "collaborator").length;
  const nvkdCount = all.length - partnerCount;
  const isPartners = group === "partner";
  const columnCount = isPartners ? 7 : 5;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Thù lao & chi trả · ${formatMonthLabel(month).toLowerCase()}`}
        description={`${formatMonthRangeLabel(month)} · Phí/thù lao theo phụ lục áp dụng cho tháng; doanh thu đối tác gồm cả nhân viên trong thời gian được ghi nhận.${
          isCurrentMonth ? " Kỳ đang mở — số liệu cập nhật theo từng đơn đã thanh toán." : ""
        }`}
        actions={
          <>
            <MonthPicker month={month} basePath={BASE_PATH} searchParams={keep} />
            <ExportCsvButton rows={rows} totals={totals} month={month} />
            <PaymentRequestDialog
              month={month}
              searchParams={{}}
              defaultRequesterName={sessionDisplayName(session)}
              payableCount={requestRows.length}
              payableAmount={sum(requestRows, (r) => r.payable)}
              missingInfoCount={requestRows.filter((r) => r.missing.length > 0).length}
            />
          </>
        }
      />

      <nav aria-label="Nhóm được chi trả" className="flex flex-wrap gap-1 border-b">
        {(
          [
            ["partner", `Đối tác · ${partnerCount}`],
            ["nvkd", `Nhân viên kinh doanh FireAnt · ${nvkdCount}`],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={href({ group: key === "partner" ? undefined : key, tier: undefined, missing: undefined })}
            aria-current={group === key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold transition-colors",
              group === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={isPartners ? "Phí/thù lao đối tác" : "Hoa hồng NVKD"}
          value={formatVND(live.payable)}
          hint={`${formatNumber(live.earners)} người · hiệu dụng ${
            live.base > 0 ? formatPercent(live.payable / live.base) : "—"
          } doanh thu tính thù lao`}
          trend={trendOf((s) => s.payable, false)}
        />
        <StatCard
          label="Doanh thu tính thù lao"
          value={formatVND(live.base)}
          hint={
            live.revenue > live.base
              ? `Trong tổng ${formatVND(live.revenue)} · ${
                  usesSplitPolicy(month) ? "" : "gia hạn, nâng cấp của phụ lục chưa tính; "
                }khóa học thanh toán riêng`
              : `Tổng doanh thu ${formatVND(live.revenue)}`
          }
          trend={trendOf((s) => s.base)}
        />
        {isPartners ? (
          <StatCard
            label="Doanh thu từ nhân viên"
            value={formatVND(live.staff)}
            hint={live.revenue > 0 ? `${formatPercent(live.staff / live.revenue)} doanh thu đối tác` : "Chưa có doanh thu"}
            trend={trendOf((s) => s.staff)}
          />
        ) : (
          <StatCard
            label="Lương cứng"
            value={formatVND(live.baseSalary)}
            hint="Trả qua bảng lương, không nằm trong giấy đề nghị"
            trend={trendOf((s) => s.baseSalary, false)}
          />
        )}
      </div>

      <Suspense fallback={<HistoryChartSkeleton />}>
        <GroupHistory history={history} group={group} month={month} monthHref={monthHref} />
      </Suspense>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={href({ tier: undefined, missing: undefined })}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold",
              !tierFilter && !missingOnly ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            Tất cả
          </Link>
          {isPartners
            ? [...CONTRACT_TIERS].reverse().map((tier) => (
                <Link
                  key={tier}
                  href={href({ tier, missing: undefined })}
                  aria-current={tierFilter === tier ? "true" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
                    tierFilter === tier ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <TierDot tier={tier} className="size-2" />
                  {CONTRACT_TIER_LABELS[tier]} · {tierCounts[tier]}
                </Link>
              ))
            : null}
          <Link
            href={href({ missing: missingOnly ? undefined : "1", tier: undefined })}
            aria-current={missingOnly ? "true" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-semibold",
              missingOnly ? "border-warning bg-warning/10 text-warning" : "hover:bg-muted",
            )}
          >
            Thiếu thông tin · {missingCount}
          </Link>
        </div>
        <form className="ml-auto flex min-w-60 flex-1 gap-2 sm:max-w-sm">
          <input type="hidden" name="month" value={month} />
          {!isPartners ? <input type="hidden" name="group" value={group} /> : null}
          <Input name="q" defaultValue={q} placeholder="Tìm tên, email, số điện thoại" aria-label="Tìm người được chi trả" className="h-10" />
          <Button type="submit" variant="outline" className="h-10">
            Tìm
          </Button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className={cn("w-full border-collapse text-sm", isPartners ? "min-w-[1040px]" : "min-w-[760px]")}>
            <thead>
              <tr className="whitespace-nowrap bg-muted/40 text-xs text-muted-foreground">
                <th className="px-5 py-3 text-left font-semibold">{isPartners ? "Đối tác" : "Nhân viên kinh doanh"}</th>
                {isPartners ? (
                  <>
                    <th className="px-3 py-3 text-left font-semibold">Phụ lục {monthTag}</th>
                    <th className="px-3 py-3 text-right font-semibold">DS trực tiếp</th>
                    <th className="px-3 py-3 text-right font-semibold">DS từ nhân viên</th>
                  </>
                ) : null}
                <th className="px-3 py-3 text-right font-semibold">DS tính thù lao</th>
                <th className="px-3 py-3 text-right font-semibold">{isPartners ? "Phí/thù lao" : "Hoa hồng"}</th>
                <th className="px-5 py-3 text-left font-semibold">Thông tin chi trả</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-5 py-12 text-center text-muted-foreground">
                    {inGroup.length === 0 ? "Chưa có ai phát sinh doanh số trong tháng này." : "Không có ai khớp bộ lọc."}
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => {
                const name = r.displayName;
                const rem = r.remuneration;
                return (
                  <tr key={r.partnerId} className="border-t hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                          {initialsOf(name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <Link
                            href={`/admin/partners/${r.partnerId}?month=${month}`}
                            className="truncate font-semibold hover:text-primary hover:underline"
                          >
                            {name}
                          </Link>
                          <span className="truncate text-xs text-muted-foreground">
                            {isPartners ? `${r.legalType === "company" ? "Pháp nhân" : "Cá nhân"} · ` : ""}
                            {r.email}
                            {!r.isActive ? " · tạm dừng" : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    {isPartners ? (
                      <>
                        <td className="px-3 py-3">
                          <TierBadge tier={r.tier} />
                        </td>
                        <td className="num px-3 py-3 text-right">{formatVND(r.directRevenue)}</td>
                        <td className="num px-3 py-3 text-right">
                          {r.staffRevenue > 0 ? formatVND(r.staffRevenue) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </>
                    ) : null}
                    <td className="num px-3 py-3 text-right">
                      <span className="flex flex-col items-end">
                        <span className="font-semibold">{formatVND(rem.revenue)}</span>
                        <span className="text-xs text-muted-foreground">{rem.policy === "tier" ? "khách mới" : "gói hội viên"}</span>
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-right">
                      <span className="flex flex-col items-end">
                        <span className="font-semibold text-success">{formatVND(r.payable)}</span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {isPartners ? contractTierScheme(r.tier) : "Bậc NVKD"} · {formatPercent(rem.effectiveRate)}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {r.missing.length > 0 ? (
                        <Link
                          href={`/admin/partners/${r.partnerId}/edit`}
                          title={`Thiếu ${r.missing.join(", ")}`}
                          className="inline-flex rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning hover:underline"
                        >
                          Thiếu thông tin
                        </Link>
                      ) : r.bankName || r.payable > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[13px]">
                          <CheckIcon className="size-3.5 text-success" />
                          {r.bankName ?? "Đủ thông tin"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Không phát sinh</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t bg-muted/40 font-semibold">
                  <td className="px-5 py-3" colSpan={isPartners ? 2 : 1}>
                    Cộng {formatNumber(rows.length)} người
                    {rows.length !== inGroup.length ? (
                      <span className="font-normal text-muted-foreground"> (trong {formatNumber(inGroup.length)})</span>
                    ) : null}
                  </td>
                  {isPartners ? (
                    <>
                      <td className="num px-3 py-3 text-right">{formatVND(sum(rows, (r) => r.directRevenue))}</td>
                      <td className="num px-3 py-3 text-right">{formatVND(sum(rows, (r) => r.staffRevenue))}</td>
                    </>
                  ) : null}
                  <td className="num px-3 py-3 text-right">{formatVND(sum(rows, (r) => r.remuneration.revenue))}</td>
                  <td className="num px-3 py-3 text-right text-success">{formatVND(sum(rows, (r) => r.payable))}</td>
                  <td className="px-5 py-3 text-[13px] font-normal text-muted-foreground">
                    {rows.filter((r) => r.missing.length > 0).length} thiếu thông tin
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <p className="text-[13px] leading-6 text-muted-foreground">
        FireAnt chỉ chi trả cho đối tác; nhân viên của đối tác do đối tác tự trả. Hoa hồng NVKD không gồm lương cứng (trả qua
        bảng lương). Số liệu luôn tính lại từ đơn đã thanh toán và phụ lục của tháng, nên hãy lưu file giấy đề nghị làm chứng
        từ của kỳ. Bấm tên để xem cách tính từng dòng.
      </p>
    </div>
  );
}
