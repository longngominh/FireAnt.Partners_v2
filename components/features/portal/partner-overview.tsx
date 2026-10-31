import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelLink, StatCard } from "@/components/shared/panel";
import { ContractChip } from "@/components/features/tiers/tier-ui";
import { contractTierScheme, PARTNER_TYPE_LABELS } from "@/lib/commission";
import { payableAmount } from "@/lib/earnings/explain";
import { getPartnerMonths } from "@/lib/data/partner-portal";
import { getLinkStats, getPortalContract, type PartnerSummary } from "@/lib/data/portal";
import { listClassifiedOrders, ORDER_KIND_LABELS, otherRevenue } from "@/lib/data/revenue-breakdown";
import { listStaffApplications } from "@/lib/data/staff";
import { countPaidOrdersWithoutAccount } from "@/lib/data/pending-accounts";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatShortVND, formatVND } from "@/lib/utils/currency";
import { currentMonthKey, formatDay, formatMonthStart, monthRange, parseMonthKey } from "@/lib/utils/month";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
}

/** Tổng quan của đối tác: doanh thu trực tiếp + nhân viên, phí/thù lao theo phụ lục. */
export async function PartnerOverview({ summary, name }: { summary: PartnerSummary; name: string }) {
  const partnerId = summary.partnerId;
  const month = currentMonthKey();
  const { month: monthNumber } = parseMonthKey(month);
  const isCollaborator = summary.partnerType === "collaborator";
  const [contract, data, links] = await Promise.all([
    getPortalContract(partnerId),
    getPartnerMonths({ partnerId, partnerType: summary.partnerType, lastMonth: month, count: 1 }),
    getLinkStats(partnerId, true),
  ]);
  const { current, members } = data;
  const activeMembers = members.filter((m) => m.isActive);
  const payout = payableAmount(current.remuneration);
  const base = current.remuneration.revenue;
  const topStaff = members
    .map((m) => ({ member: m, breakdown: data.staffThisMonth.get(m.staffPartnerId) }))
    .filter((x) => x.member.isActive || (x.breakdown?.total.revenue ?? 0) > 0)
    .sort((a, b) => (b.breakdown?.total.revenue ?? 0) - (a.breakdown?.total.revenue ?? 0))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Đối tác" className="flex flex-wrap items-center gap-5 rounded-2xl border bg-card p-6 shadow-xs">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xl font-bold text-primary">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-[26px]">{name}</h1>
            {isCollaborator ? (
              <ContractChip
                tier={contract.tier}
                since={contract.effectiveMonth ? formatMonthStart(contract.effectiveMonth) : null}
              />
            ) : (
              <span className="inline-flex h-7 items-center rounded-full border bg-muted px-2.5 text-[13px] font-semibold">
                {PARTNER_TYPE_LABELS[summary.partnerType]}
              </span>
            )}
            <span className="inline-flex h-7 items-center rounded-full border bg-muted px-2.5 text-[13px] font-semibold">
              {summary.legalType === "company" ? "Đối tác pháp nhân" : "Đối tác cá nhân"}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {activeMembers.length > 0 ? `${activeMembers.length} nhân viên bán hàng đang hoạt động · ` : ""}
            Hạng chỉ thay đổi khi bạn ký phụ lục mới với FireAnt.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10">
            <Link href="/earnings">Thu nhập &amp; hợp đồng</Link>
          </Button>
          <Button asChild className="h-10 gap-2">
            <Link href="/payment/create">
              <PlusIcon className="size-4" />
              Tạo link bán hàng
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={`Doanh thu tháng ${monthNumber}`}
          value={formatShortVND(current.total.total.revenue)}
          hint={`Trực tiếp ${formatShortVND(current.direct.total.revenue)} · nhân viên ${formatShortVND(current.staff.total.revenue)}`}
        />
        <StatCard
          label={current.remuneration.policy === "tier" ? "Doanh thu tính thù lao" : "Doanh số tính thù lao"}
          value={formatVND(base)}
          hint={
            current.remuneration.policy === "tier"
              ? `Khách mua gói hội viên lần đầu · chưa tính ${formatShortVND(otherRevenue(current.total))} gia hạn, khác`
              : "Chính sách Thường: bậc lũy tiến trên doanh số gói hội viên"
          }
        />
        <StatCard
          label="Phí/thù lao tạm tính"
          value={formatVND(payout)}
          tone="success"
          href="/earnings"
          hint={`${contractTierScheme(current.tier)} · hiệu dụng ${formatPercent(current.remuneration.effectiveRate)}`}
        />
        <StatCard
          label="Khách mới trong tháng"
          value={formatNumber(current.total.new.customers)}
          hint="Khách mua gói hội viên lần đầu qua link của bạn và nhân viên"
        />
        <StatCard
          label="Nhân viên đang hoạt động"
          value={formatNumber(activeMembers.length)}
          href="/team"
          hint={members.length > activeMembers.length ? `${members.length - activeMembers.length} người đã ngừng` : "Xem và đề xuất nhân viên"}
        />
        <StatCard
          label="Link chờ thanh toán"
          value={formatNumber(links.pending)}
          tone={links.pending > 0 ? "warning" : "default"}
          href="/payment?status=PENDING"
          hint={
            links.pending > 0
              ? `Tổng ${formatShortVND(links.pendingValue)}${links.nextExpiry ? ` · sớm nhất hết hạn ${formatDay(links.nextExpiry)}` : ""}`
              : "Không có link nào đang chờ"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title={`Doanh thu theo nguồn · tháng ${monthNumber}`}
          description="Doanh số của nhân viên chỉ tính cho bạn trong thời gian họ được ghi nhận."
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">Nguồn</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Tổng doanh thu</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Khách mới</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Tính thù lao</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Bán trực tiếp", b: current.direct },
                  { label: `Từ nhân viên (${activeMembers.length})`, b: current.staff },
                ].map((row) => (
                  <tr key={row.label} className="border-t">
                    <td className="px-5 py-3 font-medium">{row.label}</td>
                    <td className="num px-3 py-3 text-right">{formatShortVND(row.b.total.revenue)}</td>
                    <td className="num px-3 py-3 text-right">{formatNumber(row.b.new.customers)}</td>
                    <td className="num px-5 py-3 text-right font-semibold">{formatShortVND(row.b.new.revenue)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-5 py-3">Cộng</td>
                  <td className="num px-3 py-3 text-right">{formatShortVND(current.total.total.revenue)}</td>
                  <td className="num px-3 py-3 text-right">{formatNumber(current.total.new.customers)}</td>
                  <td className="num px-5 py-3 text-right">{formatShortVND(current.total.new.revenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Nhân viên nổi bật tháng này"
          actions={<PanelLink href="/team">Tất cả nhân viên</PanelLink>}
        >
          {topStaff.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-2 text-sm text-muted-foreground">
              <span>Chưa có nhân viên bán hàng.</span>
              <PanelLink href="/team/propose">Đề xuất nhân viên</PanelLink>
            </div>
          ) : (
            <ul className="flex flex-col">
              {topStaff.map(({ member, breakdown }) => (
                <li key={member.staffPartnerId} className="flex items-center gap-3 border-t py-2.5 first:border-t-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {initials(member.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{member.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(breakdown?.new.customers ?? 0)} khách mới{member.isActive ? "" : " · đã ngừng"}
                    </span>
                  </span>
                  <span className="num text-sm font-semibold">{formatShortVND(breakdown?.total.revenue ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Giao dịch gần đây"
          description="Mỗi đơn ghi rõ người bán và loại đơn."
          actions={<PanelLink href="/customers">Khách hàng</PanelLink>}
        >
          <Suspense fallback={<p className="py-4 text-sm text-muted-foreground">Đang tải…</p>}>
            <RecentOrders partnerId={partnerId} members={Object.fromEntries(members.map((m) => [m.staffPartnerId, m.name]))} />
          </Suspense>
        </Panel>
        <Panel className="lg:col-span-2" title="Cần xử lý">
          <Suspense fallback={<p className="py-4 text-sm text-muted-foreground">Đang tải…</p>}>
            <PartnerTodos summary={summary} expiringSoon={links.expiringSoon} />
          </Suspense>
        </Panel>
      </div>
    </div>
  );
}

async function RecentOrders({ partnerId, members }: { partnerId: number; members: Record<number, string> }) {
  const now = new Date();
  const orders = await listClassifiedOrders({
    start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
    end: monthRange(currentMonthKey()).end,
    partnerId,
    top: 6,
  });
  if (orders.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Chưa có đơn thanh toán nào gần đây.</p>;
  }
  return (
    <ul className="flex flex-col">
      {orders.map((o) => (
        <li key={o.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2.5 first:border-t-0">
          <span className="flex min-w-0 flex-1 basis-60 flex-col">
            <span className="truncate text-sm font-medium">
              {o.customerUserName ?? "Khách"} · {o.packageName ?? "Gói dịch vụ"}
            </span>
            <span className="text-xs text-muted-foreground">
              {o.sellerId === partnerId ? "Bạn bán" : `${members[o.sellerId] ?? "Nhân viên"} (nhân viên)`} ·{" "}
              {formatDay(o.orderDate)}
              {o.couponCode ? ` · ${o.couponCode}` : ""}
            </span>
          </span>
          <span
            className={cn(
              "inline-flex h-5.5 items-center rounded-full border px-2 text-xs font-semibold",
              o.kind === "new" ? "border-success/30 bg-success/10 text-success" : "bg-muted text-foreground/80",
            )}
          >
            {ORDER_KIND_LABELS[o.kind]}
          </span>
          <span className="num w-24 text-right text-sm font-semibold">{formatVND(o.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

async function PartnerTodos({ summary, expiringSoon }: { summary: PartnerSummary; expiringSoon: number }) {
  const [proposals, pendingAccounts] = await Promise.all([
    listStaffApplications({ partnerId: summary.partnerId, status: "pending" }),
    countPaidOrdersWithoutAccount(null, summary.partnerId),
  ]);
  const missingInfo = !summary.bankAccountNumber;
  const items = [
    proposals.length > 0 && {
      href: "/team?tab=proposals",
      title: `${proposals.length} đề xuất nhân viên chờ FireAnt duyệt`,
      desc: "Nhân viên được ghi nhận từ ngày duyệt.",
    },
    pendingAccounts > 0 && {
      href: "/payment/pending-account",
      title: `${pendingAccounts} đơn đã thanh toán, khách chưa có tài khoản`,
      desc: "Tạo tài khoản hộ khách để gói được kích hoạt.",
    },
    expiringSoon > 0 && {
      href: "/payment?status=PENDING",
      title: `${expiringSoon} link hết hạn trong 48 giờ`,
      desc: "Nhắc khách thanh toán trước khi link hết hạn.",
    },
    missingInfo && {
      href: "/profile",
      title: "Thiếu thông tin chi trả",
      desc: "Chưa có số tài khoản nhận thù lao.",
    },
  ].filter(Boolean) as { href: string; title: string; desc: string }[];

  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Không có việc nào cần xử lý.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors hover:border-primary/40"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">{item.title}</span>
              <span className="text-xs text-muted-foreground">{item.desc}</span>
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
