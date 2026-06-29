import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { auth } from "@/auth";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { listPartners, type Partner } from "@/lib/data/partners";
import { formatVND, formatNumber } from "@/lib/utils/currency";
import { PartnerDetailLink } from "./partner-detail-link";

export const metadata = { title: "Quản lý đối tác" };

type SearchParams = Promise<{ page?: string; sort?: string; order?: string }>;
type SortKey = "name" | "revenue" | "commission" | "customers" | "links" | "createdAt";
type SortOrder = "asc" | "desc";

const PAGE_SIZE = 20;
const SORT_KEYS = new Set<SortKey>([
  "name",
  "revenue",
  "commission",
  "customers",
  "links",
  "createdAt",
]);
const DEFAULT_SORT_ORDERS: Record<SortKey, SortOrder> = {
  name: "asc",
  revenue: "desc",
  commission: "desc",
  customers: "desc",
  links: "desc",
  createdAt: "desc",
};

function isSortKey(value: string | undefined): value is SortKey {
  return SORT_KEYS.has(value as SortKey);
}

function getSortValue(partner: Partner, sort: SortKey): string | number {
  switch (sort) {
    case "name":
      return partner.name ?? partner.username ?? partner.email;
    case "revenue":
      return partner.totalRevenue;
    case "commission":
      return partner.totalCommission;
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

function buildSortHref(sort: SortKey, currentSort: SortKey | undefined, currentOrder: SortOrder) {
  const nextOrder =
    currentSort === sort
      ? currentOrder === "asc"
        ? "desc"
        : "asc"
      : DEFAULT_SORT_ORDERS[sort];
  const sp = new URLSearchParams({ sort, order: nextOrder });

  return `/admin/partners?${sp.toString()}`;
}

function SortableTableHead({
  sort,
  label,
  currentSort,
  currentOrder,
  className = "",
  align = "left",
}: {
  sort: SortKey;
  label: string;
  currentSort: SortKey | undefined;
  currentOrder: SortOrder;
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
        href={buildSortHref(sort, currentSort, currentOrder)}
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
  const activePartners = (await listPartners()).filter((p) => p.isActive);
  const sortedPartners = sortPartners(activePartners, sort, order);
  const total = activePartners.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rawPage = Number(params.page ?? "1") || 1;
  const page = Math.min(Math.max(rawPage, 1), totalPages);
  const partners = sortedPartners.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Quản lý đối tác</h1>
          <p className="text-sm text-muted-foreground">
            {total} đối tác đang hoạt động. Bấm vào hàng để xem hiệu suất chi tiết.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <SortableTableHead
                sort="name"
                label="Đối tác"
                currentSort={sort}
                currentOrder={order}
              />
              <SortableTableHead
                sort="revenue"
                label="Doanh thu"
                currentSort={sort}
                currentOrder={order}
                align="right"
                className="text-right"
              />
              <SortableTableHead
                sort="commission"
                label="Hoa hồng"
                currentSort={sort}
                currentOrder={order}
                align="right"
                className="bg-success/5 text-right text-success"
              />
              <SortableTableHead
                sort="customers"
                label="Khách"
                currentSort={sort}
                currentOrder={order}
                align="right"
                className="text-right"
              />
              <SortableTableHead
                sort="links"
                label="Link"
                currentSort={sort}
                currentOrder={order}
                align="right"
                className="text-right"
              />
              <SortableTableHead
                sort="createdAt"
                label="Hợp tác từ"
                currentSort={sort}
                currentOrder={order}
                className="hidden md:table-cell"
              />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
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
                  </div>
                </TableCell>
                <TableCell className="num text-right text-sm">
                  {formatVND(p.totalRevenue)}
                </TableCell>
                <TableCell className="num bg-success/5 text-right text-sm font-semibold text-success">
                  {formatVND(p.totalCommission)}
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
                <TableCell>
                  <PartnerDetailLink href={`/admin/partners/${p.id}`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/admin/partners"
        searchParams={{ sort, order: sort ? order : undefined }}
      />
    </div>
  );
}
