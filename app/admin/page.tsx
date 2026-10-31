import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelLink, StatCard } from "@/components/shared/panel";
import { TierStackChart, type TierStackPoint } from "@/components/features/tiers/tier-stack-chart";
import { TIER_CLASSES, TierBadge } from "@/components/features/tiers/tier-ui";
import { requireAdminSession } from "@/lib/auth/session";
import { CONTRACT_TIER_LABELS } from "@/lib/commission";
import { getAdminOverview } from "@/lib/data/admin-overview";
import { countPaidOrdersWithoutAccount } from "@/lib/data/pending-accounts";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatShortVND } from "@/lib/utils/currency";
import { formatDay, parseMonthKey } from "@/lib/utils/month";

export const metadata = { title: "Tổng quan hệ thống" };

async function PendingAccountsAction() {
  const count = await countPaidOrdersWithoutAccount(null);
  return (
    <ActionRow
      count={count}
      title="Đơn đã thanh toán, khách chưa có tài khoản"
      description="Gói chưa kích hoạt được cho khách"
      href="/admin/pending-accounts"
      tone="muted"
    />
  );
}

function ActionRow({
  count,
  title,
  description,
  href,
  tone,
}: {
  count: number;
  title: string;
  description: string;
  href: string;
  tone: "warning" | "danger" | "muted";
}) {
  if (count <= 0) return null;
  return (
    <Link href={href} className="flex items-center gap-3 border-t py-3 first:border-t-0 first:pt-0 hover:text-primary">
      <span
        className={cn(
          "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-bold",
          tone === "warning" && "bg-admin-chip text-admin-chip-foreground",
          tone === "danger" && "bg-destructive/10 text-destructive",
          tone === "muted" && "bg-muted text-foreground",
        )}
      >
        {formatNumber(count)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        {description ? <span className="truncate text-xs text-muted-foreground">{description}</span> : null}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default async function AdminOverviewPage() {
  await requireAdminSession();
  const data = await getAdminOverview();
  const { month: monthNumber, year } = parseMonthKey(data.month);
  const totalPartners = data.distribution.reduce((s, d) => s + d.count, 0);

  const trend: TierStackPoint[] = data.policyTrend.map((p) => {
    const { month: m, year: y } = parseMonthKey(p.month);
    return {
      label: `T${m}`,
      title: `Tháng ${m}/${y}${p.month === data.month ? " · tạm tính" : ""}`,
      normal: p.normal,
      silver: p.silver,
      gold: p.gold,
      diamond: p.diamond,
    };
  });

  const pendingHint =
    data.pending.count > 0
      ? `Từ ${data.pending.partners} đối tác · cũ nhất gửi ${formatDay(data.pending.oldest)}`
      : "Không có đề xuất nào đang chờ";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tổng quan hệ thống"
        description={`Tháng ${monthNumber}/${year} · ${formatNumber(data.counts.partners)} đối tác, ${formatNumber(
          data.staff.active,
        )} nhân viên bán hàng, ${formatNumber(data.counts.salesEmployees)} NVKD FireAnt.`}
        actions={
          <>
            <Button asChild variant="outline" className="h-10 gap-2">
              <Link href="/admin/links/new">Tạo link hộ</Link>
            </Button>
            <Button asChild className="h-10 gap-2">
              <Link href="/admin/partners/new">
                <UserPlusIcon className="size-4" />
                Thêm đối tác
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Doanh thu tính thù lao"
          value={formatShortVND(data.kpis.baseRevenue)}
          hint="Theo chính sách của từng đối tác, gồm doanh số nhân viên"
        />
        <StatCard
          label="Tổng doanh thu qua link"
          value={formatShortVND(data.kpis.totalRevenue)}
          hint="Gồm gia hạn, nâng cấp và NVKD"
        />
        <StatCard
          label="Phí/thù lao tạm tính"
          value={formatShortVND(data.kpis.payout)}
          hint={
            data.kpis.baseRevenue > 0
              ? `${formatPercent(data.kpis.payout / data.kpis.baseRevenue)} doanh thu tính thù lao`
              : "Chưa phát sinh trong tháng"
          }
          tone="success"
          href="/admin/payouts"
        />
        <StatCard
          label="Nhân viên bán hàng"
          value={formatNumber(data.staff.active)}
          hint={`Thuộc ${data.staff.partners} đối tác · ${data.staff.endedThisMonth} ngừng ghi nhận tháng này`}
          href="/admin/partners"
        />
        <StatCard
          label="Đề xuất nhân viên chờ duyệt"
          value={formatNumber(data.pending.count)}
          hint={pendingHint}
          tone={data.pending.count > 0 ? "warning" : "default"}
          href="/admin/approvals"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title="Doanh thu tính thù lao theo chính sách hợp đồng"
          description="6 tháng gần nhất · gồm doanh số của nhân viên · mỗi đối tác tính theo phụ lục của tháng đó"
        >
          <TierStackChart data={trend} />
        </Panel>

        <Panel
          className="lg:col-span-5"
          title="Đối tác theo chính sách"
          description={`${formatNumber(totalPartners)} đối tác · theo phụ lục đang có hiệu lực`}
        >
          <div className="flex flex-col gap-4">
            <div
              role="img"
              aria-label={data.distribution.map((d) => `${CONTRACT_TIER_LABELS[d.tier]} ${d.count} đối tác`).join(", ")}
              className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-muted"
            >
              {[...data.distribution].reverse().map((d) =>
                d.count > 0 ? (
                  <span
                    key={d.tier}
                    className={TIER_CLASSES[d.tier].mark}
                    style={{ width: `${(d.count / Math.max(1, totalPartners)) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <div className="flex flex-col">
              <div className="grid grid-cols-[1fr_64px_96px] gap-2 pb-2 text-xs text-muted-foreground">
                <span>Chính sách</span>
                <span className="text-right">Đối tác</span>
                <span className="text-right">Phí T{monthNumber}</span>
              </div>
              {[...data.distribution].reverse().map((d) => (
                <div key={d.tier} className="grid grid-cols-[1fr_64px_96px] items-center gap-2 border-t py-2.5 text-sm">
                  <TierBadge tier={d.tier} />
                  <span className="num text-right font-semibold">{d.count}</span>
                  <span className="num text-right text-muted-foreground">{formatShortVND(d.payout)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Mỗi đối tác chỉ lưu phụ lục đang áp dụng; phụ lục áp dụng cho cả tháng, tính từ ngày 01.
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title={`Đối tác dẫn đầu tháng ${monthNumber}`}
          actions={<PanelLink href="/admin/partners">Xem tất cả đối tác</PanelLink>}
          flush
        >
          {data.leaders.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">Chưa có doanh thu tính thù lao trong tháng.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40 text-xs text-muted-foreground">
                    <th className="w-10 px-5 py-2.5 text-left font-semibold">#</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Đối tác</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Chính sách</th>
                    <th className="px-3 py-2.5 text-right font-semibold">DS tính thù lao</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Khách mới</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Nhân viên</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaders.map((l, i) => (
                    <tr key={l.partnerId} className="border-t hover:bg-muted/30">
                      <td className="px-5 py-3 font-bold text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-3">
                        <Link href={`/admin/partners/${l.partnerId}`} className="font-semibold hover:text-primary hover:underline">
                          {l.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <TierBadge tier={l.tier} />
                      </td>
                      <td className="num px-3 py-3 text-right font-semibold">{formatShortVND(l.base)}</td>
                      <td className="num px-3 py-3 text-right">{formatNumber(l.newCustomers)}</td>
                      <td className="num px-5 py-3 text-right">{formatNumber(l.staff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <Panel title="Cần xử lý">
            <div className="flex flex-col">
              <ActionRow
                count={data.pending.count}
                title="Đề xuất nhân viên chờ duyệt"
                description={pendingHint}
                href="/admin/approvals"
                tone="warning"
              />
              <ActionRow
                count={data.missingInfo.length}
                title="Có phí/thù lao nhưng thiếu thông tin chi trả"
                description={data.missingInfo
                  .slice(0, 3)
                  .map((m) => m.name)
                  .join(", ")}
                href="/admin/payouts?missing=1"
                tone="danger"
              />
              <Suspense fallback={null}>
                <PendingAccountsAction />
              </Suspense>
              {data.pending.count === 0 && data.missingInfo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có đề xuất hay thông tin chi trả nào bị vướng.</p>
              ) : null}
            </div>
          </Panel>

          <Panel title="Nhân viên của đối tác" actions={<PanelLink href="/admin/approvals">Duyệt nhân viên</PanelLink>}>
            <dl className="flex flex-col">
              {[
                { title: "Đang hoạt động", sub: `Thuộc ${data.staff.partners} đối tác`, value: data.staff.active },
                {
                  title: "Chờ FireAnt duyệt",
                  sub: data.pending.count > 0 ? `Đề xuất từ ${data.pending.partners} đối tác` : "Không có đề xuất chờ",
                  value: data.pending.count,
                },
                { title: `Ngừng ghi nhận trong tháng ${monthNumber}`, sub: "Do đối tác hoặc FireAnt ngừng", value: data.staff.endedThisMonth },
                ...(data.staff.top
                  ? [{ title: "Nhiều nhân viên nhất", sub: data.staff.top.name, value: data.staff.top.count }]
                  : []),
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-3 border-t py-3 first:border-t-0 first:pt-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <dt className="text-sm font-semibold">{item.title}</dt>
                    <span className="truncate text-xs text-muted-foreground">{item.sub}</span>
                  </span>
                  <dd className="num text-lg font-bold">{formatNumber(item.value)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
