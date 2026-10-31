import Link from "next/link";
import { InfoIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/panel";
import { CancelProposalButton } from "@/components/features/staff/cancel-proposal-button";
import { StaffTable, type StaffRowView } from "@/components/features/staff/staff-table";
import { requirePartnerSession } from "@/lib/auth/session";
import { getPartnerMonths } from "@/lib/data/partner-portal";
import { getPartnerSummary } from "@/lib/data/portal";
import {
  APPLICATION_STATUS_LABELS,
  getStaffLinkCounts,
  listStaffApplications,
  type ApplicationStatus,
} from "@/lib/data/staff";
import { hasStaffModel, STAFF_MIGRATION_HINT } from "@/lib/data/staff-model";
import { cn } from "@/lib/utils";
import { formatNumber, formatShortVND } from "@/lib/utils/currency";
import { currentMonthKey, formatDay, parseMonthKey } from "@/lib/utils/month";

export const metadata = { title: "Nhân viên bán hàng" };

const TABS = [
  { key: "active", label: "Đang hoạt động" },
  { key: "proposals", label: "Đề xuất" },
  { key: "ended", label: "Đã ngừng" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_TONE: Record<ApplicationStatus, string> = {
  pending: "border-warning/40 bg-warning/10 text-warning",
  approved: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { partnerId } = await requirePartnerSession();
  const params = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === params.tab) ? (params.tab as TabKey) : "active";
  const ready = await hasStaffModel();
  const month = currentMonthKey();
  const { month: monthNumber } = parseMonthKey(month);

  const summary = await getPartnerSummary(partnerId);
  const [data, applications, linkCounts] = await Promise.all([
    getPartnerMonths({ partnerId, partnerType: summary?.partnerType ?? "collaborator", lastMonth: month, count: 1 }),
    listStaffApplications({ partnerId }),
    getStaffLinkCounts(partnerId),
  ]);
  const { members, staffThisMonth, current } = data;
  const active = members.filter((m) => m.isActive);
  const ended = members.filter((m) => !m.isActive);
  const pending = applications.filter((a) => a.status === "pending");

  const toRow = (m: (typeof members)[number]): StaffRowView => {
    const b = staffThisMonth.get(m.staffPartnerId);
    const links = linkCounts.get(m.staffPartnerId);
    return {
      id: m.staffPartnerId,
      name: m.name,
      userName: m.userName,
      phone: m.phone,
      initials: initials(m.name),
      isActive: m.isActive,
      joined: formatDay(m.startDate),
      proposed: m.proposedAt ? formatDay(m.proposedAt) : null,
      ended: m.endDate ? formatDay(m.endDate) : null,
      endedBy: m.endedByRole === "admin" ? "FireAnt" : m.endedByRole === "partner" ? "Bạn" : null,
      newCustomers: formatNumber(b?.new.customers ?? 0),
      revenue: formatShortVND(b?.total.revenue ?? 0),
      newRevenue: formatShortVND(b?.new.revenue ?? 0),
      orders: formatNumber(b?.total.orders ?? 0),
      linksThisMonth: links?.thisMonth ?? 0,
      linksPending: links?.pending ?? 0,
    };
  };
  const counts: Record<TabKey, string> = {
    active: String(active.length),
    proposals: pending.length > 0 ? `${pending.length} chờ duyệt` : String(applications.length),
    ended: String(ended.length),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nhân viên bán hàng"
        description="Nhân viên trực thuộc bạn. Doanh số qua link của nhân viên được cộng vào doanh thu của bạn trong thời gian họ được ghi nhận. Việc chia thu nhập với nhân viên do bạn tự thỏa thuận."
        actions={
          <Button asChild className="h-10 gap-2" disabled={!ready}>
            <Link href="/team/propose">
              <UserPlusIcon className="size-4" />
              Đề xuất nhân viên
            </Link>
          </Button>
        }
      />

      {!ready ? (
        <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <InfoIcon className="mt-0.5 size-4.5 shrink-0 text-warning" />
          {STAFF_MIGRATION_HINT}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Doanh thu từ nhân viên · T${monthNumber}`}
          value={formatShortVND(current.staff.total.revenue)}
          hint={`Tính thù lao ${formatShortVND(current.staff.new.revenue)}`}
        />
        <StatCard
          label="Khách mới từ nhân viên"
          value={formatNumber(current.staff.new.customers)}
          hint="Khách mua gói hội viên lần đầu"
        />
        <StatCard label="Đang hoạt động" value={formatNumber(active.length)} hint="Không tính người chờ duyệt" />
        <StatCard
          label="Chờ FireAnt duyệt"
          value={formatNumber(pending.length)}
          tone={pending.length > 0 ? "warning" : "default"}
          href="/team?tab=proposals"
          hint="Xem ở tab Đề xuất"
        />
      </div>

      <section aria-label="Danh sách nhân viên" className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
        <nav aria-label="Nhóm nhân viên" className="flex gap-6 border-b px-5">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "active" ? "/team" : `/team?tab=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-12 items-center gap-2 border-b-2 text-sm",
                tab === t.key ? "border-primary font-semibold text-primary" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground/80">{counts[t.key]}</span>
            </Link>
          ))}
        </nav>

        {tab === "active" ? (
          active.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="text-base font-semibold">Chưa có nhân viên nào</span>
              <span className="max-w-md text-sm leading-6 text-muted-foreground">
                Đề xuất nhân viên để họ có link bán hàng riêng. Doanh số của nhân viên được cộng vào doanh thu của bạn từ ngày
                FireAnt duyệt.
              </span>
              <Button asChild className="h-10" disabled={!ready}>
                <Link href="/team/propose">Đề xuất nhân viên</Link>
              </Button>
            </div>
          ) : (
            <StaffTable rows={active.map(toRow)} today={formatDay(new Date())} />
          )
        ) : null}

        {tab === "proposals" ? (
          <div className="flex flex-col">
            {applications.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">Bạn chưa gửi đề xuất nào.</p>
            ) : (
              applications.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3.5 border-b px-5 py-4 last:border-b-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold">
                    {initials(a.fullName ?? a.userName)}
                  </span>
                  <span className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
                    <span className="font-semibold">{a.fullName ?? a.userName}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {a.userName} · gửi {formatDay(a.createdAt)}
                    </span>
                    {a.status === "rejected" && a.rejectReason ? (
                      <span className="text-[13px] text-destructive">Lý do: {a.rejectReason}</span>
                    ) : null}
                  </span>
                  <span className={cn("inline-flex h-6.5 items-center rounded-full border px-2.5 text-xs font-semibold", STATUS_TONE[a.status])}>
                    {APPLICATION_STATUS_LABELS[a.status]}
                    {a.reviewedAt && a.status !== "pending" ? ` ${formatDay(a.reviewedAt)}` : ""}
                  </span>
                  {a.status === "pending" ? <CancelProposalButton applicationId={a.id} /> : null}
                </div>
              ))
            )}
            <p className="px-5 py-3.5 text-[13px] leading-5 text-muted-foreground">
              FireAnt kiểm tra tài khoản rồi duyệt hoặc từ chối kèm lý do. Nhân viên chỉ bắt đầu được ghi nhận từ ngày duyệt.
            </p>
          </div>
        ) : null}

        {tab === "ended" ? (
          <div className="flex flex-col">
            {ended.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">Chưa có nhân viên nào ngừng hợp tác.</p>
            ) : (
              <StaffTable rows={ended.map(toRow)} today={formatDay(new Date())} />
            )}
            <p className="px-5 py-3.5 text-[13px] leading-5 text-muted-foreground">
              Giao dịch phát sinh sau ngày ngừng không tính cho bạn. Link chờ thanh toán của người đã ngừng vẫn dùng được nhưng
              không được ghi nhận.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
