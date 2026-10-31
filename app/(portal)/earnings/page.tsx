import { CreditCardIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { MonthPicker } from "@/components/features/revenue/month-picker";
import { TierSchedule } from "@/components/features/tiers/tier-schedule";
import { TierBadge, TierMedallion, TIER_CLASSES } from "@/components/features/tiers/tier-ui";
import { requirePartnerSession } from "@/lib/auth/session";
import { contractTierScheme, contractTierTitle, PARTNER_TYPE_LABELS } from "@/lib/commission";
import { explainRemuneration, payableAmount } from "@/lib/earnings/explain";
import { getPartnerMonths } from "@/lib/data/partner-portal";
import { getPartnerSummary, getPortalContract } from "@/lib/data/portal";
import { otherRevenue } from "@/lib/data/revenue-breakdown";
import { cn } from "@/lib/utils";
import { formatPercent, formatShortVND, formatVND } from "@/lib/utils/currency";
import {
  currentMonthKey,
  formatMonthLabel,
  formatMonthShort,
  formatMonthStart,
  normalizeMonthKey,
} from "@/lib/utils/month";

export const metadata = { title: "Thu nhập & hợp đồng" };

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { partnerId } = await requirePartnerSession();
  const params = await searchParams;
  const now = currentMonthKey();
  const month = normalizeMonthKey(params.month);
  const summary = await getPartnerSummary(partnerId);
  const partnerType = summary?.partnerType ?? "collaborator";
  const isCollaborator = partnerType === "collaborator";

  const [contract, selectedData, history] = await Promise.all([
    getPortalContract(partnerId),
    getPartnerMonths({ partnerId, partnerType, lastMonth: month, count: 1 }),
    getPartnerMonths({ partnerId, partnerType, lastMonth: now, count: 6 }),
  ]);
  const selected = selectedData.current;
  const r = selected.remuneration;
  const lines = explainRemuneration(r);
  const payout = payableAmount(r);
  const isTier = r.policy === "tier";
  const base = r.revenue;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Thu nhập & hợp đồng"
        description={
          isCollaborator
            ? "Phí/thù lao FireAnt trả cho bạn theo phụ lục hợp đồng đang áp dụng. Doanh thu của nhân viên được cộng vào doanh thu của bạn trong thời gian họ được ghi nhận."
            : "Hoa hồng nhân viên kinh doanh theo bậc doanh số; lương cứng trả qua bảng lương."
        }
        actions={<MonthPicker month={month} basePath="/earnings" />}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {isCollaborator ? (
          <Panel className="lg:col-span-5" title="Chính sách hiện tại">
            <div className="flex flex-col gap-4">
              <div
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3.5",
                  TIER_CLASSES[contract.tier].soft,
                  TIER_CLASSES[contract.tier].border,
                )}
              >
                <TierMedallion tier={contract.tier} size="sm" />
                <span className="flex flex-col gap-0.5">
                  <span className={cn("text-xl font-bold", TIER_CLASSES[contract.tier].fg)}>
                    {contractTierTitle(contract.tier)}
                  </span>
                  <span className="text-sm">
                    {contract.effectiveMonth
                      ? `Áp dụng từ ${formatMonthStart(contract.effectiveMonth)} · cho cả tháng, tính từ ngày 01`
                      : "Chưa ký phụ lục hạng · bậc lũy tiến trên doanh số gói hội viên"}
                  </span>
                </span>
              </div>
              <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Người đứng tên</dt>
                <dd className="font-medium">
                  {summary?.fullName ?? summary?.userName ?? "—"} ·{" "}
                  {summary?.legalType === "company" ? "pháp nhân" : "cá nhân"}
                </dd>
                <dt className="text-muted-foreground">Căn cứ tính</dt>
                <dd className="font-medium">
                  {contract.tier === "normal"
                    ? "Doanh số gói hội viên trong tháng (khóa học thanh toán riêng)"
                    : "Doanh thu khách mua gói hội viên lần đầu"}
                </dd>
              </dl>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold">Biểu tính · {contractTierScheme(contract.tier)}</span>
                <TierSchedule
                  tier={contract.tier}
                  revenue={month === now ? base : null}
                />
                <span className="text-xs leading-5 text-muted-foreground">
                  Hạng chỉ đổi khi FireAnt cập nhật phụ lục mới bạn đã ký. Phụ lục mới áp dụng cho cả tháng, tính từ ngày 01.
                </span>
              </div>
            </div>
          </Panel>
        ) : null}

        <Panel className={isCollaborator ? "lg:col-span-7" : "lg:col-span-12"} title={formatMonthLabel(month)}>
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-xl border bg-muted/30 px-4 py-3">
                <span className="text-[13px] text-muted-foreground">Doanh thu tháng</span>
                <span className="num text-2xl font-bold">{formatShortVND(selected.total.total.revenue)}</span>
                <span className="text-xs text-muted-foreground">
                  Trực tiếp {formatShortVND(selected.direct.total.revenue)} + nhân viên {formatShortVND(selected.staff.total.revenue)}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border bg-muted/30 px-4 py-3">
                <span className="text-[13px] text-muted-foreground">{isTier ? "Doanh thu tính thù lao" : "Doanh số tính thù lao"}</span>
                <span className="num text-2xl font-bold">{formatVND(base)}</span>
                <span className="text-xs text-muted-foreground">
                  {isTier
                    ? `Khách mua gói hội viên lần đầu · ${selected.total.new.customers} khách`
                    : "Doanh số gói hội viên qua link, không gồm khóa học"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-muted-foreground">
                {month === now ? "Phí/thù lao tạm tính" : "Phí/thù lao"}
              </span>
              <span className="num text-4xl font-bold tracking-tight text-success">{formatVND(payout)}</span>
              <span className="text-[13px] text-muted-foreground">
                {contractTierScheme(selected.tier)} · hiệu dụng {formatPercent(r.effectiveRate)}
                {r.baseSalary > 0 ? ` · lương cứng ${formatVND(r.baseSalary)} trả qua bảng lương` : ""}
              </span>
            </div>

            {lines.length > 0 ? (
              <div role="table" aria-label="Cách tính" className="flex flex-col border-t text-sm">
                {lines.map((line) => (
                  <div key={line.label} role="row" className="flex justify-between gap-4 border-b py-2.5">
                    <span role="cell" className="text-foreground/80">
                      {line.label}
                    </span>
                    <span role="cell" className="num font-semibold">
                      {formatVND(line.amount)}
                    </span>
                  </div>
                ))}
                <div role="row" className="flex justify-between gap-4 py-2.5 font-bold">
                  <span role="cell">Phí/thù lao</span>
                  <span role="cell" className="num text-success">
                    {formatVND(payout)}
                  </span>
                </div>
              </div>
            ) : null}

            {isTier ? (
              <p className="text-[13px] leading-5 text-muted-foreground">
                Gia hạn, nâng cấp và khóa học ({formatShortVND(otherRevenue(selected.total))}) vẫn ghi nhận nhưng chưa tính theo
                phụ lục. Số liệu được chốt sau ngày cuối tháng.
              </p>
            ) : null}

            <div className="flex gap-3 rounded-xl border bg-muted/30 px-4 py-3">
              <CreditCardIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span className="flex flex-col gap-0.5 text-[13px] leading-5">
                <span className="font-semibold">
                  {summary?.bankAccountNumber
                    ? `Chi trả vào ${summary.bankName ?? "ngân hàng"} ••••${summary.bankAccountNumber.slice(-4)} · ${(summary.fullName ?? "").toUpperCase()}`
                    : "Chưa có số tài khoản nhận thù lao"}
                </span>
                <span className="text-muted-foreground">FireAnt chỉ chi cho người đứng tên hợp đồng.</span>
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Phí/thù lao 6 tháng gần nhất"
        description="Mỗi tháng tính theo phụ lục áp dụng cho tháng đó; tháng đã chốt giữ nguyên."
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="whitespace-nowrap bg-muted/40 text-xs text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-semibold">Tháng</th>
                <th className="px-3 py-2.5 text-left font-semibold">{isCollaborator ? "Phụ lục" : "Chế độ"}</th>
                <th className="px-3 py-2.5 text-right font-semibold">Tổng doanh thu</th>
                <th className="px-3 py-2.5 text-right font-semibold">Từ nhân viên</th>
                <th className="px-3 py-2.5 text-right font-semibold">Tính thù lao</th>
                <th className="px-5 py-2.5 text-right font-semibold">Phí/thù lao</th>
              </tr>
            </thead>
            <tbody>
              {[...history.months].reverse().map((m) => (
                <tr key={m.month} className={cn("border-t", m.month === month && "bg-primary/5")}>
                  <td className="px-5 py-3 font-medium">
                    {formatMonthShort(m.month)}
                    {m.month === now ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">tạm tính</span> : null}
                  </td>
                  <td className="px-3 py-3">
                    {isCollaborator ? <TierBadge tier={m.tier} /> : PARTNER_TYPE_LABELS[partnerType]}
                  </td>
                  <td className="num px-3 py-3 text-right">{formatVND(m.total.total.revenue)}</td>
                  <td className="num px-3 py-3 text-right text-muted-foreground">{formatVND(m.staff.total.revenue)}</td>
                  <td className="num px-3 py-3 text-right">{formatVND(m.remuneration.revenue)}</td>
                  <td className="num px-5 py-3 text-right font-semibold">{formatVND(payableAmount(m.remuneration))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
