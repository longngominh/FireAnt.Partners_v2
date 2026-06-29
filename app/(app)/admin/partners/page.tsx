import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { PencilIcon, PlusIcon } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/lib/commission";
import { listPartners, type Partner } from "@/lib/data/partners";
import { formatVND, formatNumber } from "@/lib/utils/currency";
import { PartnerDetailLink } from "./partner-detail-link";

export const metadata = { title: "Quản lý cộng tác viên" };

type SearchParams = Promise<{
  page?: string;
  sort?: string;
  order?: string;
  q?: string;
  status?: string;
  type?: string;
}>;
type SortKey =
  | "name"
  | "type"
  | "status"
  | "revenue"
  | "commission"
  | "remuneration"
  | "customers"
  | "links"
  | "createdAt";
type SortOrder = "asc" | "desc";
type StatusFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | PartnerType;

const PAGE_SIZE = 20;
const SORT_KEYS = new Set<SortKey>([
  "name",
  "type",
  "status",
  "revenue",
  "commission",
  "remuneration",
  "customers",
  "links",
  "createdAt",
]);
const DEFAULT_SORT_ORDERS: Record<SortKey, SortOrder> = {
  name: "asc",
  type: "asc",
  status: "desc",
  revenue: "desc",
  commission: "desc",
  remuneration: "desc",
  customers: "desc",
  links: "desc",
  createdAt: "desc",
};

function isSortKey(value: string | undefined): value is SortKey {
  return SORT_KEYS.has(value as SortKey);
}

function isStatusFilter(value: string | undefined): value is StatusFilter {
  return value === "active" || value === "inactive" || value === "all";
}

function isTypeFilter(value: string | undefined): value is TypeFilter {
  return value === "sales_employee" || value === "collaborator" || value === "all";
}

function getSortValue(partner: Partner, sort: SortKey): string | number {
  switch (sort) {
    case "name":
      return partner.name ?? partner.username ?? partner.email;
    case "type":
      return partner.partnerTypeLabel;
    case "status":
      return partner.isActive ? 1 : 0;
    case "revenue":
      return partner.totalRevenue;
    case "commission":
      return partner.totalCommission;
    case "remuneration":
      return partner.monthlyRemuneration.total;
    case "customers":
      return partner.customerCount;
    case "links":
      return partner.couponCount;
    case "createdAt":
      return partner.createdAt?.getTime() ?? 0;
  }
}

function sortPartners(partners: Partner[], sort: SortKey | undefined, order: SortOrder) {
  if (!sort) return partners;

  const direction = order === "asc" ? 1 : -1;
  return [...partners].sort((a, b) => {
    const left = getSortValue(a, sort);
    const right = getSortValue(b, sort);
    const result =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right, "vi", { sensitivity: "base" })
        : Number(left) - Number(right);

    return result * direction;
  });
}

function matchesSearch(partner: Partner, query: string): boolean {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("vi");
  return [partner.name, partner.email, partner.username, partner.phone]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase("vi").includes(needle));
}

function filterPartners(
  partners: Partner[],
  query: string,
  status: StatusFilter,
  type: TypeFilter,
) {
  return partners.filter((partner) => {
    if (!matchesSearch(partner, query)) return false;
    if (status === "active" && !partner.isActive) return false;
    if (status === "inactive" && partner.isActive) return false;
    if (type !== "all" && partner.partnerType !== type) return false;
    return true;
  });
}

function buildSortHref({
  sort,
  currentSort,
  currentOrder,
  q,
  status,
  type,
}: {
  sort: SortKey;
  currentSort: SortKey | undefined;
  currentOrder: SortOrder;
  q: string;
  status: StatusFilter;
  type: TypeFilter;
}) {
  const nextOrder =
    currentSort === sort
      ? currentOrder === "asc"
        ? "desc"
        : "asc"
      : DEFAULT_SORT_ORDERS[sort];
  const sp = new URLSearchParams({ sort, order: nextOrder });
  if (q) sp.set("q", q);
  if (status !== "active") sp.set("status", status);
  if (type !== "all") sp.set("type", type);

  return `/admin/partners?${sp.toString()}`;
}

function SortableTableHead({
  sort,
  label,
  currentSort,
  currentOrder,
  q,
  status,
  type,
  className = "",
  align = "left",
}: {
  sort: SortKey;
  label: string;
  currentSort: SortKey | undefined;
  currentOrder: SortOrder;
  q: string;
  status: StatusFilter;
  type: TypeFilter;
  className?: string;
  align?: "left" | "right";
}) {
  const isActive = currentSort === sort;
  const indicator = isActive ? (currentOrder === "asc" ? "↑" : "↓") : "↕";
  const nextOrder =
    currentSort === sort
      ? currentOrder === "asc"
        ? "desc"
        : "asc"
      : DEFAULT_SORT_ORDERS[sort];

  return (
    <TableHead className={className}>
      <Link
        href={buildSortHref({ sort, currentSort, currentOrder, q, status, type })}
        aria-label={`Sắp xếp theo ${label} ${nextOrder === "asc" ? "tăng dần" : "giảm dần"}`}
        className={`inline-flex items-center gap-1 hover:text-primary ${
          align === "right" ? "justify-end text-right" : ""
        } ${isActive ? "font-semibold text-foreground" : ""}`}
      >
        <span className={align === "right" ? "w-full" : ""}>{label}</span>
        <span aria-hidden className="text-[10px] text-muted-foreground">
          {indicator}
        </span>
      </Link>
    </TableHead>
  );
}

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return null;
  }

  const params = await searchParams;
  const sort = isSortKey(params.sort) ? params.sort : undefined;
  const order: SortOrder = params.order === "desc" ? "desc" : "asc";
  const q = (params.q ?? "").trim();
  const status: StatusFilter = isStatusFilter(params.status) ? params.status : "active";
  const type: TypeFilter = isTypeFilter(params.type) ? params.type : "all";
  const allPartners = await listPartners();
  const filteredPartners = filterPartners(allPartners, q, status, type);
  const sortedPartners = sortPartners(filteredPartners, sort, order);
  const total = allPartners.length;
  const activeCount = allPartners.filter((p) => p.isActive).length;
  const filteredTotal = filteredPartners.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const rawPage = Number(params.page ?? "1") || 1;
  const page = Math.min(Math.max(rawPage, 1), totalPages);
  const partners = sortedPartners.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(q) || status !== "active" || type !== "all";
  const paginationParams = {
    q: q || undefined,
    status: status === "active" ? undefined : status,
    type: type === "all" ? undefined : type,
    sort,
    order: sort ? order : undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Quản lý cộng tác viên</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount}/{total} cộng tác viên đang hoạt động. Bấm vào hàng để xem hiệu suất chi tiết.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/partners/new">
            <PlusIcon className="size-4" /> Thêm cộng tác viên
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_220px_auto_auto]">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, email, tài khoản, số điện thoại"
            aria-label="Tìm cộng tác viên"
          />
          <select
            name="status"
            defaultValue={status}
            aria-label="Lọc theo trạng thái"
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Tạm dừng</option>
          </select>
          <select
            name="type"
            defaultValue={type}
            aria-label="Lọc theo loại cộng tác viên"
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="all">Tất cả loại</option>
            <option value="sales_employee">{PARTNER_TYPE_LABELS.sales_employee}</option>
            <option value="collaborator">{PARTNER_TYPE_LABELS.collaborator}</option>
          </select>
          {sort ? <input type="hidden" name="sort" value={sort} /> : null}
          {sort ? <input type="hidden" name="order" value={order} /> : null}
          <Button type="submit">Lọc</Button>
          {hasFilters ? (
            <Button asChild variant="outline">
              <Link href="/admin/partners">Xóa lọc</Link>
            </Button>
          ) : null}
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Đang hiển thị {filteredTotal}/{total} cộng tác viên.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <SortableTableHead
                sort="name"
                label="Cộng tác viên"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
              />
              <SortableTableHead
                sort="type"
                label="Loại"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
                className="hidden lg:table-cell"
              />
              <SortableTableHead
                sort="status"
                label="Trạng thái"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
                className="hidden lg:table-cell"
              />
              <SortableTableHead
                sort="revenue"
                label="Doanh thu tổng"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
                align="right"
                className="text-right"
              />
              <SortableTableHead
                sort="commission"
                label="Hoa hồng"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
                align="right"
                className="bg-success/5 text-right text-success"
              />
              <SortableTableHead
                sort="remuneration"
                label="Thù lao tháng"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
                align="right"
                className="text-right"
              />
              <SortableTableHead
                sort="customers"
                label="Khách"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
                align="right"
                className="text-right"
              />
              <SortableTableHead
                sort="links"
                label="Link"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
                align="right"
                className="text-right"
              />
              <SortableTableHead
                sort="createdAt"
                label="Hợp tác từ"
                currentSort={sort}
                currentOrder={order}
                q={q}
                status={status}
                type={type}
                className="hidden md:table-cell"
              />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  Không tìm thấy cộng tác viên phù hợp.
                </TableCell>
              </TableRow>
            ) : null}
            {partners.map((p, index) => (
              <TableRow
                key={p.id}
                className={`group ${index % 2 === 1 ? "bg-muted/20" : ""}`}
              >
                <TableCell>
                  <div className="flex flex-col leading-tight">
                    <Link
                      href={`/admin/partners/${p.id}`}
                      className="text-sm font-medium hover:text-primary hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{p.email}</span>
                    <div className="mt-1 flex flex-wrap gap-1 lg:hidden">
                      <Badge variant="outline">{p.partnerTypeLabel}</Badge>
                      <Badge
                        variant="outline"
                        className={
                          p.isActive
                            ? "border-success/30 bg-success/15 text-success"
                            : "border-muted-foreground/30 bg-muted text-muted-foreground"
                        }
                      >
                        {p.isActive ? "Hoạt động" : "Tạm dừng"}
                      </Badge>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge variant="outline" className="w-fit">
                    {p.partnerTypeLabel}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge
                    variant="outline"
                    className={`w-fit ${
                      p.isActive
                        ? "border-success/30 bg-success/15 text-success"
                        : "border-muted-foreground/30 bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.isActive ? "Đang hoạt động" : "Tạm dừng"}
                  </Badge>
                </TableCell>
                <TableCell className="num text-right text-sm">
                  {formatVND(p.totalRevenue)}
                </TableCell>
                <TableCell className="num bg-success/5 text-right text-sm font-semibold text-success">
                  {formatVND(p.totalCommission)}
                </TableCell>
                <TableCell className="num text-right text-sm font-semibold">
                  {formatVND(p.monthlyRemuneration.total)}
                  <div className="text-[11px] font-normal text-muted-foreground">
                    DT tháng {formatVND(p.monthlyRevenue)}
                  </div>
                </TableCell>
                <TableCell className="num text-right text-sm">
                  {formatNumber(p.customerCount)}
                </TableCell>
                <TableCell className="num text-right text-sm">
                  {formatNumber(p.couponCount)}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {p.createdAt ? format(p.createdAt, "MM/yyyy", { locale: vi }) : "—"}
                </TableCell>
                <TableCell className="w-20">
                  <div className="flex justify-end gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100"
                    >
                      <Link href={`/admin/partners/${p.id}/edit`} aria-label="Sửa cộng tác viên">
                        <PencilIcon className="size-3.5" />
                      </Link>
                    </Button>
                    <PartnerDetailLink href={`/admin/partners/${p.id}`} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={filteredTotal}
        basePath="/admin/partners"
        searchParams={paginationParams}
      />
    </div>
  );
}
