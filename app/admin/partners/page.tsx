import Link from "next/link";
import { CheckIcon, PencilIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { TierBadge, TierDot } from "@/components/features/tiers/tier-ui";
import { requireAdminSession } from "@/lib/auth/session";
import {
  CONTRACT_TIER_LABELS,
  CONTRACT_TIERS,
  contractTierScheme,
  isContractTier,
  type ContractTier,
} from "@/lib/commission";
import { payableAmount } from "@/lib/earnings/explain";
import { getContractsForMonth } from "@/lib/data/contracts";
import { getPartnerPaymentInfoMap, missingPaymentFields } from "@/lib/data/partner-payment-info";
import { listPartners } from "@/lib/data/partners";
import { getMonthlyRevenueReport } from "@/lib/data/revenue";
import { countActiveStaffByPartner } from "@/lib/data/staff";
import { cn } from "@/lib/utils";
import { formatNumber, formatVND } from "@/lib/utils/currency";
import { currentMonthKey, formatMonthStart, parseMonthKey } from "@/lib/utils/month";
import { PartnerDetailLink } from "./partner-detail-link";

export const metadata = { title: "Đối tác" };

type SearchParams = Promise<{
  page?: string;
  sort?: string;
  q?: string;
  status?: string;
  type?: string;
  tier?: string;
  missing?: string;
}>;

type SortKey = "base" | "payout" | "staff" | "name" | "createdAt";
const SORTS: Record<SortKey, string> = {
  base: "DS tính thù lao",
  payout: "Phí/thù lao",
  staff: "Số nhân viên",
  name: "Tên",
  createdAt: "Ngày hợp tác",
};
const PAGE_SIZE = 25;

const SELECT_CLASS =
  "h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toLocaleUpperCase("vi") ?? "")
    .join("");
}

/**
 * Danh bạ người ký hợp đồng với FireAnt: đối tác (cá nhân/pháp nhân, theo phụ lục đang áp dụng)
 * và NVKD của FireAnt. Nhân viên bán hàng của đối tác không có dòng riêng — xem trong hồ sơ đối tác.
 */
export default async function AdminPartnersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminSession();
  const params = await searchParams;
  const month = currentMonthKey();
  const { month: monthNumber } = parseMonthKey(month);

  const q = (params.q ?? "").trim();
  const status = params.status === "inactive" || params.status === "all" ? params.status : "active";
  const type: "partner" | "nvkd" = params.type === "nvkd" ? "nvkd" : "partner";
  const tierFilter: ContractTier | null = type === "partner" && isContractTier(params.tier) ? params.tier : null;
  const missingOnly = params.missing === "1";
  const sort: SortKey = params.sort && params.sort in SORTS ? (params.sort as SortKey) : "base";

  const [partners, report, contracts, paymentInfo, staffCounts] = await Promise.all([
    listPartners(),
    getMonthlyRevenueReport({ month }),
    getContractsForMonth(month),
    getPartnerPaymentInfoMap(),
    countActiveStaffByPartner(),
  ]);
  const monthRows = new Map(report.rows.map((r) => [r.partnerId, r]));

  const rows = partners
    .filter((p) => !p.isStaff)
    .map((p) => {
      const m = monthRows.get(p.id);
      const info = paymentInfo.get(p.id);
      const contract = contracts.get(p.id);
      return {
        ...p,
        displayName: info?.fullName || p.name || p.username,
        isCompany: info?.legalType === "company",
        taxCode: info?.taxCode ?? null,
        tier: contract?.tier ?? ("normal" as ContractTier),
        since: contract?.effectiveMonth ?? null,
        base: m?.remuneration.revenue ?? 0,
        tierPolicy: m?.remuneration.policy === "tier",
        payout: m ? payableAmount(m.remuneration) : 0,
        staff: staffCounts.get(p.id) ?? 0,
        missing: missingPaymentFields(info),
      };
    });

  const inTab = rows.filter((r) => (type === "nvkd" ? r.partnerType === "sales_employee" : r.partnerType === "collaborator"));
  const needle = q.toLocaleLowerCase("vi");
  const filtered = inTab.filter((r) => {
    if (
      needle &&
      ![r.displayName, r.name, r.email, r.username, r.phone, r.taxCode].some((v) => v?.toLocaleLowerCase("vi").includes(needle))
    ) {
      return false;
    }
    if (status === "active" && !r.isActive) return false;
    if (status === "inactive" && r.isActive) return false;
    if (tierFilter && r.tier !== tierFilter) return false;
    if (missingOnly && r.missing.length === 0) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "name":
        return a.displayName.localeCompare(b.displayName, "vi", { sensitivity: "base" });
      case "payout":
        return b.payout - a.payout;
      case "staff":
        return b.staff - a.staff;
      case "createdAt":
        return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
      default:
        return b.base - a.base || b.payout - a.payout;
    }
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(params.page ?? "1") || 1, 1), totalPages);
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeTab = inTab.filter((r) => r.isActive);
  const activePartners = rows.filter((r) => r.isActive && r.partnerType === "collaborator");
  const tierCounts = Object.fromEntries(
    CONTRACT_TIERS.map((t) => [t, activeTab.filter((r) => r.tier === t).length]),
  ) as Record<ContractTier, number>;
  const missingCount = activeTab.filter((r) => r.missing.length > 0).length;
  const totalStaff = activePartners.reduce((s, r) => s + r.staff, 0);
  const isPartnerTab = type === "partner";

  const baseParams = {
    q: q || undefined,
    status: status === "active" ? undefined : status,
    type: isPartnerTab ? undefined : type,
    tier: tierFilter ?? undefined,
    missing: missingOnly ? "1" : undefined,
    sort: sort === "base" ? undefined : sort,
  };
  const href = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...baseParams, ...overrides })) if (v) sp.set(k, v);
    const query = sp.toString();
    return `/admin/partners${query ? `?${query}` : ""}`;
  };
  const chip = (on: boolean, tone: "primary" | "destructive" = "primary") =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
      on
        ? tone === "primary"
          ? "border-primary bg-primary/10 text-primary"
          : "border-destructive bg-destructive/10 text-destructive"
        : "hover:bg-muted",
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Đối tác"
        description={`${formatNumber(activePartners.length)} đối tác đang hoạt động · ${formatNumber(
          activePartners.filter((r) => !r.isCompany).length,
        )} cá nhân, ${formatNumber(activePartners.filter((r) => r.isCompany).length)} pháp nhân · ${formatNumber(
          totalStaff,
        )} nhân viên bán hàng trực thuộc · chính sách theo phụ lục đang có hiệu lực`}
        actions={
          <Button asChild className="h-10 gap-2">
            <Link href="/admin/partners/new">
              <UserPlusIcon className="size-4" />
              Thêm đối tác
            </Link>
          </Button>
        }
      />

      <nav aria-label="Loại tài khoản" className="flex flex-wrap gap-1 border-b">
        {(
          [
            ["partner", "Đối tác", rows.filter((r) => r.partnerType === "collaborator" && r.isActive).length],
            ["nvkd", "NVKD FireAnt", rows.filter((r) => r.partnerType === "sales_employee" && r.isActive).length],
          ] as const
        ).map(([key, label, count]) => (
          <Link
            key={key}
            href={href({ type: key === "partner" ? undefined : key, tier: undefined, missing: undefined, page: undefined })}
            aria-current={type === key ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold transition-colors",
              type === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                type === key ? "bg-primary/10 text-primary" : "bg-muted text-foreground/80",
              )}
            >
              {count}
            </span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-1.5">
        {isPartnerTab ? (
          <>
            <Link href={href({ tier: undefined, page: undefined })} className={chip(!tierFilter)}>
              Mọi chính sách
            </Link>
            {[...CONTRACT_TIERS].reverse().map((tier) => (
              <Link
                key={tier}
                href={href({ tier, page: undefined })}
                aria-current={tierFilter === tier ? "true" : undefined}
                className={chip(tierFilter === tier)}
              >
                <TierDot tier={tier} className="size-2" />
                {CONTRACT_TIER_LABELS[tier]} · {tierCounts[tier]}
              </Link>
            ))}
          </>
        ) : null}
        <Link
          href={href({ missing: missingOnly ? undefined : "1", page: undefined })}
          aria-current={missingOnly ? "true" : undefined}
          className={chip(missingOnly, "destructive")}
        >
          Thiếu thông tin chi trả · {missingCount}
        </Link>
      </div>

      <form className="grid gap-2.5 rounded-2xl border bg-card p-4 shadow-xs md:grid-cols-[minmax(240px,1fr)_170px_200px_auto]">
        {!isPartnerTab ? <input type="hidden" name="type" value={type} /> : null}
        {tierFilter ? <input type="hidden" name="tier" value={tierFilter} /> : null}
        {missingOnly ? <input type="hidden" name="missing" value="1" /> : null}
        <Input name="q" defaultValue={q} placeholder="Tên, email, số điện thoại, mã số thuế…" aria-label="Tìm đối tác" className="h-10" />
        <select name="status" defaultValue={status} aria-label="Trạng thái" className={SELECT_CLASS}>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Tạm dừng</option>
          <option value="all">Mọi trạng thái</option>
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sắp xếp" className={SELECT_CLASS}>
          {Object.entries(SORTS).map(([key, label]) => (
            <option key={key} value={key}>
              Sắp xếp: {label}
            </option>
          ))}
        </select>
        <Button type="submit" className="h-10">
          Lọc
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="whitespace-nowrap bg-muted/40 text-xs text-muted-foreground">
                <th className="px-5 py-3 text-left font-semibold">{isPartnerTab ? "Đối tác" : "Nhân viên kinh doanh"}</th>
                <th className="px-3 py-3 text-left font-semibold">{isPartnerTab ? "Chính sách hiện hành" : "Chế độ"}</th>
                <th className="px-3 py-3 text-right font-semibold">Nhân viên</th>
                <th className="px-3 py-3 text-right font-semibold">DS tính thù lao T{monthNumber}</th>
                <th className="px-3 py-3 text-right font-semibold">{isPartnerTab ? "Phí/thù lao tạm tính" : "Hoa hồng tạm tính"}</th>
                <th className="px-3 py-3 text-left font-semibold">Thông tin chi trả</th>
                <th className="px-3 py-3 text-left font-semibold">Trạng thái</th>
                <th className="px-5 py-3">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    Không có {isPartnerTab ? "đối tác" : "nhân viên kinh doanh"} nào khớp bộ lọc.
                  </td>
                </tr>
              ) : null}
              {pageRows.map((r) => (
                <tr key={r.id} className="group border-t hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center bg-muted text-xs font-bold",
                          r.isCompany ? "rounded-lg" : "rounded-full",
                        )}
                      >
                        {initialsOf(r.displayName)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <Link href={`/admin/partners/${r.id}`} className="truncate font-semibold hover:text-primary hover:underline">
                          {r.displayName}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">
                          {isPartnerTab ? (r.isCompany ? "Pháp nhân" : "Cá nhân") : "NVKD FireAnt"} · {r.email}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {isPartnerTab ? (
                      <span className="flex flex-col gap-1">
                        <TierBadge tier={r.tier} />
                        <span className="text-xs text-muted-foreground">
                          {r.since ? `Từ ${formatMonthStart(r.since)}` : "Chưa chọn phụ lục"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Lương + bậc NVKD</span>
                    )}
                  </td>
                  <td className="num px-3 py-3 text-right">{isPartnerTab ? formatNumber(r.staff) : "—"}</td>
                  <td className="num px-3 py-3 text-right">
                    <span className="flex flex-col items-end">
                      <span className="font-semibold">{formatVND(r.base)}</span>
                      <span className="text-xs text-muted-foreground">{r.tierPolicy ? "khách mới" : "gói hội viên"}</span>
                    </span>
                  </td>
                  <td className="num px-3 py-3 text-right">
                    <span className="flex flex-col items-end">
                      <span className="font-semibold text-success">{formatVND(r.payout)}</span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {isPartnerTab ? contractTierScheme(r.tier) : "+ lương cứng"}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {r.missing.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-[13px] text-success">
                        <CheckIcon className="size-3.5" /> Đủ
                      </span>
                    ) : (
                      <span
                        title={`Thiếu ${r.missing.join(", ")}`}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs font-semibold",
                          r.payout > 0
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        Thiếu {r.missing.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-[13px]", r.isActive ? "text-success" : "text-muted-foreground")}>
                      <span className={cn("size-1.5 rounded-full", r.isActive ? "bg-success" : "bg-muted-foreground")} />
                      {r.isActive ? "Hoạt động" : "Tạm dừng"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" className="size-8 opacity-60 group-hover:opacity-100">
                        <Link href={`/admin/partners/${r.id}/edit`} aria-label={`Sửa ${r.displayName}`}>
                          <PencilIcon className="size-3.5" />
                        </Link>
                      </Button>
                      <PartnerDetailLink href={`/admin/partners/${r.id}`} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={sorted.length}
        basePath="/admin/partners"
        searchParams={baseParams}
      />
    </div>
  );
}
