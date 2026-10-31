import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeftIcon, CreditCardIcon, LinkIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelLink, StatCard } from "@/components/shared/panel";
import { Pagination } from "@/components/shared/pagination";
import { AdminStaffTable, type AdminStaffRow } from "@/components/features/admin/admin-staff-table";
import { ContractTierPicker } from "@/components/features/admin/contract-tier-picker";
import { PartnerActiveToggle } from "@/components/features/admin/partner-active-toggle";
import { PartnerSplitChart, type SplitPoint } from "@/components/features/admin/partner-split-chart";
import { MonthPicker } from "@/components/features/revenue/month-picker";
import { CouponTable } from "@/components/features/payment/coupon-table";
import { FilterBar } from "@/components/features/payment/filter-bar";
import { ContractChip, TierBadge } from "@/components/features/tiers/tier-ui";
import { requireAdminSession } from "@/lib/auth/session";
import {
  calcPartnerRemuneration,
  CONTRACT_TIER_LABELS,
  CONTRACT_TIERS,
  contractTierScheme,
  type ContractTier,
} from "@/lib/commission";
import { explainRemuneration, payableAmount } from "@/lib/earnings/explain";
import { getCurrentContract } from "@/lib/data/contracts";
import { listCoupons, listCouponSources, type CouponStatus } from "@/lib/data/payment";
import { getPartner } from "@/lib/data/partners";
import { getPartnerMonths, type PartnerMonth } from "@/lib/data/partner-portal";
import { getPartnerSummary } from "@/lib/data/portal";
import { otherRevenue, remunerationBase, type RevenueBreakdown } from "@/lib/data/revenue-breakdown";
import { getStaffAffiliation, listStaffApplications } from "@/lib/data/staff";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatShortVND, formatVND } from "@/lib/utils/currency";
import {
  currentMonthKey,
  formatDay,
  formatMonthLabel,
  formatMonthShort,
  formatMonthStart,
  normalizeMonthKey,
  parseMonthKey,
} from "@/lib/utils/month";

type SearchParams = Promise<{ q?: string; status?: string; source?: string; page?: string; month?: string }>;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await getPartner(id);
  return { title: partner ? (partner.name ?? partner.username) : "Đối tác" };
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toLocaleUpperCase("vi") ?? "")
    .join("");
}

/** Doanh thu tính thù lao của một tháng: DS khách mới (phụ lục) hoặc DS trừ khóa học (Thường, NVKD). */
function baseOf(m: PartnerMonth): { direct: number; staff: number } {
  const tierPolicy = m.remuneration.policy === "tier";
  const pick = (b: RevenueBreakdown) => (tierPolicy ? b.new.revenue : remunerationBase(b).total);
  return { direct: pick(m.direct), staff: pick(m.staff) };
}

const SECTIONS = [
  ["tong-quan", "Tổng quan"],
  ["hop-dong", "Hợp đồng & phụ lục"],
  ["nhan-vien", "Nhân viên"],
  ["thu-nhap", "Thu nhập & chi trả"],
  ["link", "Link & khách hàng"],
] as const;

export default async function PartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await requireAdminSession();
  const { id } = await params;
  const query = await searchParams;
  const [partner, summary] = await Promise.all([getPartner(id), getPartnerSummary(Number(id))]);
  if (!partner || !summary) notFound();

  // Nhân viên của đối tác không có hồ sơ riêng: xem ở đối tác họ trực thuộc.
  if (summary.isStaff) {
    const affiliation = await getStaffAffiliation(partner.id);
    if (affiliation) redirect(`/admin/partners/${affiliation.partnerId}#nhan-vien`);
    notFound();
  }

  const now = currentMonthKey();
  const month = normalizeMonthKey(query.month);
  const isPartner = partner.partnerType === "collaborator";
  const page = Number(query.page ?? "1") || 1;
  const status = (query.status ?? "ALL") as CouponStatus | "ALL";

  const [contract, data, selectedData, pending, coupons, sources] = await Promise.all([
    getCurrentContract(partner.id),
    getPartnerMonths({ partnerId: partner.id, partnerType: partner.partnerType, lastMonth: now, count: 6 }),
    month === now
      ? null
      : getPartnerMonths({ partnerId: partner.id, partnerType: partner.partnerType, lastMonth: month, count: 1 }),
    listStaffApplications({ partnerId: partner.id, status: "pending" }),
    listCoupons({ teamOf: partner.id, status, q: query.q ?? "", source: query.source ?? null, page, pageSize: 10 }),
    listCouponSources(partner.id, partner.id),
  ]);

  const name = summary.fullName || partner.name || partner.username;
  const current = data.current;
  const selected = selectedData?.current ?? current;
  const r = current.remuneration;
  const payout = payableAmount(r);
  const { month: monthNumber } = parseMonthKey(now);
  const activeStaff = data.members.filter((m) => m.isActive);
  const endedThisMonth = data.members.filter((m) => m.endDate && format(m.endDate, "yyyy-MM") === now);
  const isCompany = summary.legalType === "company";

  const fees = Object.fromEntries(
    CONTRACT_TIERS.map((tier) => {
      const rem = calcPartnerRemuneration("collaborator", tier, remunerationBase(current.total));
      return [tier, formatVND(payableAmount(rem))];
    }),
  ) as Record<ContractTier, string>;

  const chart: SplitPoint[] = data.months.map((m) => {
    const { month: mm, year } = parseMonthKey(m.month);
    return {
      label: `T${mm}`,
      policy: isPartner ? CONTRACT_TIER_LABELS[m.tier] : "NVKD",
      title: `Tháng ${mm}/${year}${m.month === now ? " · tạm tính" : ""}`,
      ...baseOf(m),
    };
  });

  const staffRows: AdminStaffRow[] = [
    ...data.members.map((m) => {
      const revenue = data.staffThisMonth.get(m.staffPartnerId)?.total.revenue ?? 0;
      return {
        key: `m${m.membershipId}`,
        staffPartnerId: m.staffPartnerId,
        name: m.name,
        userName: m.userName,
        status: m.isActive ? ("active" as const) : ("ended" as const),
        from: formatDay(m.startDate),
        to: m.endDate ? formatDay(m.endDate) : "—",
        revenue: revenue > 0 ? formatShortVND(revenue) : "—",
        endedNote: m.endDate ? (m.endedByRole === "admin" ? "FireAnt ngừng" : "Đối tác ngừng") : null,
      };
    }),
    ...pending.map((a) => ({
      key: `a${a.id}`,
      staffPartnerId: null,
      name: a.fullName ?? a.userName,
      userName: a.userName,
      status: "pending" as const,
      from: "—",
      to: "—",
      revenue: "—",
      endedNote: `Đề xuất ${formatDay(a.createdAt)}`,
    })),
  ];

  const sellerLabels: Record<number, string> = { [partner.id]: `${name} · đối tác` };
  for (const m of data.members) sellerLabels[m.staffPartnerId] = `${m.name} · nhân viên`;

  const lines = explainRemuneration(selected.remuneration);
  const selectedPayout = payableAmount(selected.remuneration);
  const lastMonth = data.months[data.months.length - 2];

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit gap-2">
        <Link href="/admin/partners">
          <ArrowLeftIcon className="size-4" /> Đối tác
        </Link>
      </Button>

      <section id="tong-quan" className="flex scroll-mt-20 flex-wrap items-center gap-5 rounded-2xl border bg-card p-5 shadow-xs">
        <span
          className={cn(
            "flex size-16 shrink-0 items-center justify-center bg-primary/12 text-xl font-bold text-primary",
            isCompany ? "rounded-2xl" : "rounded-full",
          )}
        >
          {initialsOf(name)}
        </span>
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            {isPartner ? (
              <ContractChip
                tier={contract.tier}
                since={contract.effectiveMonth ? formatMonthStart(contract.effectiveMonth) : null}
              />
            ) : null}
            <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {isPartner ? (isCompany ? "Đối tác pháp nhân" : "Đối tác cá nhân") : "NVKD FireAnt"}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                partner.isActive ? "border-success/30 bg-success/10 text-success" : "text-muted-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", partner.isActive ? "bg-success" : "bg-muted-foreground")} />
              {partner.isActive ? "Đang hoạt động" : "Tạm dừng"}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {partner.email}
            {partner.phone ? ` · ${partner.phone}` : ""}
            {partner.createdAt ? ` · Hợp tác từ ${format(partner.createdAt, "MM/yyyy")}` : ""}
            {` · ${formatNumber(activeStaff.length)} nhân viên bán hàng`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10 gap-2">
            <Link href={`/admin/links/new?partner=${partner.id}`}>
              <LinkIcon className="size-4" />
              Tạo link hộ
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-10 gap-2">
            <Link href={`/admin/partners/${partner.id}/edit`}>
              <PencilIcon className="size-4" />
              Sửa hồ sơ
            </Link>
          </Button>
          <PartnerActiveToggle partnerId={partner.id} isActive={partner.isActive} name={name} />
        </div>
      </section>

      <nav aria-label="Các phần của hồ sơ" className="flex flex-wrap gap-1 border-b">
        {SECTIONS.filter(([key]) => isPartner || key !== "hop-dong").map(([key, label]) => (
          <a
            key={key}
            href={`#${key}`}
            className="-mb-px border-b-2 border-transparent px-3 pb-2.5 pt-1 text-sm font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`DS tính thù lao T${monthNumber}`}
          value={formatVND(r.revenue)}
          hint={
            r.policy === "tier"
              ? `${formatNumber(current.total.new.customers)} khách mua hội viên lần đầu`
              : "Doanh số gói hội viên qua link, không gồm khóa học"
          }
        />
        <StatCard
          label={isPartner ? "Phí/thù lao tạm tính" : "Hoa hồng tạm tính"}
          value={formatVND(payout)}
          hint={`${isPartner ? contractTierScheme(current.tier) : "Bậc NVKD"} · hiệu dụng ${formatPercent(r.effectiveRate)}`}
          tone="success"
        />
        <StatCard
          label="Trực tiếp / từ nhân viên"
          value={`${formatShortVND(current.direct.total.revenue)} / ${formatShortVND(current.staff.total.revenue)}`}
          hint={`Tổng doanh thu ${formatShortVND(current.total.total.revenue)}`}
        />
        <StatCard
          label="Nhân viên hoạt động"
          value={formatNumber(activeStaff.length)}
          hint={`${pending.length} chờ duyệt · ${endedThisMonth.length} ngừng trong tháng`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel
          className={isPartner ? "lg:col-span-7" : "lg:col-span-12"}
          title="Doanh thu tính thù lao 6 tháng"
          description="Trực tiếp và từ nhân viên · dưới cột là phụ lục áp dụng trong tháng"
        >
          <PartnerSplitChart data={chart} />
        </Panel>

        {isPartner ? (
          <section id="hop-dong" className="scroll-mt-20 lg:col-span-5">
            <Panel
              className="h-full"
              title="Phụ lục đang áp dụng"
              description="Chỉ lưu phụ lục hiện tại. Phụ lục áp dụng cho cả tháng, tính từ ngày 01."
            >
              <div className="flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3.5 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">Áp dụng từ</dt>
                    <dd className="font-semibold">
                      {contract.effectiveMonth ? formatMonthStart(contract.effectiveMonth) : "Chưa chọn phụ lục"}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">Cập nhật lần cuối</dt>
                    <dd className="font-semibold">
                      {contract.changedAt ? `${formatDay(contract.changedAt)} · ${contract.changedBy}` : "—"}
                    </dd>
                  </div>
                </dl>
                <ContractTierPicker
                  partnerId={partner.id}
                  current={contract.tier}
                  monthLabel={`tháng ${monthNumber}`}
                  monthStart={formatMonthStart(now)}
                  fees={fees}
                />
              </div>
            </Panel>
          </section>
        ) : null}
      </div>

      <section id="nhan-vien" className="scroll-mt-20">
        <Panel
          title="Nhân viên trực thuộc"
          description={
            pending.length > 0
              ? `${pending.length} đề xuất chờ duyệt · doanh số nhân viên tính cho đối tác trong thời gian được ghi nhận`
              : "Doanh số nhân viên tính cho đối tác trong thời gian được ghi nhận"
          }
          actions={pending.length > 0 ? <PanelLink href="/admin/approvals">Duyệt nhân viên</PanelLink> : undefined}
          flush
        >
          <AdminStaffTable partnerId={partner.id} rows={staffRows} revenueHeader={`DS T${monthNumber}`} />
        </Panel>
      </section>

      <section id="thu-nhap" className="grid scroll-mt-20 gap-5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title={`Cách tính · ${formatMonthLabel(month).toLowerCase()}`}
          actions={<MonthPicker month={month} basePath={`/admin/partners/${partner.id}`} />}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {isPartner ? <TierBadge tier={selected.tier} size="md" /> : null}
              <span className="text-muted-foreground">
                {selected.remuneration.policy === "tier"
                  ? `Căn cứ: doanh thu khách mua hội viên lần đầu ${formatVND(selected.total.new.revenue)} (trực tiếp ${formatVND(
                      selected.direct.new.revenue,
                    )} + nhân viên ${formatVND(selected.staff.new.revenue)})`
                  : `Căn cứ: doanh số gói hội viên ${formatVND(selected.remuneration.revenue)} (không gồm khóa học)`}
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
                  <span role="cell">{isPartner ? "Phí/thù lao" : "Hoa hồng"}</span>
                  <span role="cell" className="num text-success">
                    {formatVND(selectedPayout)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Không phát sinh phí/thù lao trong tháng.</p>
            )}
            {selected.remuneration.policy === "tier" && otherRevenue(selected.total) > 0 ? (
              <p className="text-[13px] leading-5 text-muted-foreground">
                Gia hạn, nâng cấp và khóa học ({formatShortVND(otherRevenue(selected.total))}) vẫn ghi nhận doanh thu nhưng chưa
                tính theo phụ lục.
              </p>
            ) : null}
            {selected.remuneration.baseSalary > 0 ? (
              <p className="text-[13px] leading-5 text-muted-foreground">
                Lương cứng {formatVND(selected.remuneration.baseSalary)} trả qua bảng lương, không nằm trong giấy đề nghị.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel className="lg:col-span-5" title="Thông tin chi trả">
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Người đứng tên</dt>
              <dd className="text-right font-semibold">{(summary.fullName ?? "—").toUpperCase()}</dd>
              <dt className="text-muted-foreground">Loại đối tác</dt>
              <dd className="text-right font-semibold">{isPartner ? (isCompany ? "Pháp nhân" : "Cá nhân") : "NVKD FireAnt"}</dd>
              <dt className="text-muted-foreground">Mã số thuế</dt>
              <dd className={cn("text-right", summary.taxCode ? "font-semibold" : "text-muted-foreground")}>
                {summary.taxCode ?? "Chưa cập nhật"}
              </dd>
              <dt className="text-muted-foreground">Tài khoản</dt>
              <dd className={cn("text-right font-semibold", !summary.bankAccountNumber && "text-destructive")}>
                {summary.bankAccountNumber
                  ? `${summary.bankName ?? "Ngân hàng"} ••••${summary.bankAccountNumber.slice(-4)}`
                  : "Chưa có"}
              </dd>
              {lastMonth ? (
                <>
                  <dt className="text-muted-foreground">Kỳ {formatMonthShort(lastMonth.month)}</dt>
                  <dd className="num text-right font-semibold">{formatVND(payableAmount(lastMonth.remuneration))}</dd>
                </>
              ) : null}
            </dl>
            <div className="flex gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-[13px] leading-5">
              <CreditCardIcon className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">
                FireAnt chỉ chi cho người đứng tên hợp đồng. Doanh số của nhân viên đã cộng vào đối tác.
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <PanelLink href={`/admin/partners/${partner.id}/edit`}>Sửa thông tin chi trả</PanelLink>
              <PanelLink href={`/admin/payouts?month=${month}&q=${encodeURIComponent(partner.email ?? partner.username)}`}>
                Xem bảng kê chi trả
              </PanelLink>
            </div>
          </div>
        </Panel>
      </section>

      <section id="link" className="flex scroll-mt-20 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Link của đối tác và nhân viên</h2>
            <p className="text-sm text-muted-foreground">
              Tổng {formatNumber(coupons.total)} link, gồm link nhân viên tạo trong thời gian được ghi nhận. Bấm vào từng hàng để
              xem QR và copy link.
            </p>
          </div>
          <PanelLink href={`/admin/customers?partner=${partner.id}`}>Khách hàng của đối tác</PanelLink>
        </div>
        <FilterBar sources={sources} />
        <CouponTable rows={coupons.rows} partnerLabels={sellerLabels} sellerHeader="Người tạo" />
        <Pagination
          page={page}
          pageSize={coupons.pageSize}
          total={coupons.total}
          basePath={`/admin/partners/${partner.id}`}
          searchParams={{ q: query.q, status: query.status, source: query.source, month: query.month }}
        />
      </section>
    </div>
  );
}
