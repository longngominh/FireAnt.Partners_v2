import type { PartnerType } from "@/lib/commission";
import type { MonthlyPartnerRevenue } from "@/lib/data/revenue";

/**
 * Bộ lọc/sắp xếp của bảng kê doanh thu tháng. Tách khỏi trang để route xuất
 * Giấy đề nghị thanh toán tái tạo đúng danh sách mà admin đang nhìn thấy.
 */

export const REVENUE_SORT_KEYS = [
  "name",
  "revenue",
  "commission",
  "remuneration",
  "orders",
  "customers",
] as const;

export type RevenueSortKey = (typeof REVENUE_SORT_KEYS)[number];
export type SortOrder = "asc" | "desc";

export type TypeFilter = "all" | PartnerType;
export type StatusFilter = "all" | "active" | "inactive";
export type RowsFilter = "earning" | "all";

export type RevenueFilters = {
  q: string;
  type: TypeFilter;
  status: StatusFilter;
  rows: RowsFilter;
};

export type RevenueSorting = {
  sort: RevenueSortKey;
  order: SortOrder;
};

export const DEFAULT_SORT: RevenueSortKey = "revenue";
export const DEFAULT_ORDERS: Record<RevenueSortKey, SortOrder> = {
  name: "asc",
  revenue: "desc",
  commission: "desc",
  remuneration: "desc",
  orders: "desc",
  customers: "desc",
};

type RawParams = Record<string, string | undefined>;

function isSortKey(value: string | undefined): value is RevenueSortKey {
  return REVENUE_SORT_KEYS.includes(value as RevenueSortKey);
}

function isTypeFilter(value: string | undefined): value is TypeFilter {
  return value === "all" || value === "sales_employee" || value === "collaborator";
}

function isStatusFilter(value: string | undefined): value is StatusFilter {
  return value === "all" || value === "active" || value === "inactive";
}

export function parseRevenueFilters(params: RawParams): RevenueFilters {
  return {
    q: (params.q ?? "").trim(),
    type: isTypeFilter(params.type) ? params.type : "all",
    status: isStatusFilter(params.status) ? params.status : "all",
    rows: params.rows === "all" ? "all" : "earning",
  };
}

export function parseRevenueSorting(params: RawParams): RevenueSorting {
  const sort = isSortKey(params.sort) ? params.sort : DEFAULT_SORT;
  const order: SortOrder =
    params.order === "asc" || params.order === "desc" ? params.order : DEFAULT_ORDERS[sort];
  return { sort, order };
}

function matchesSearch(row: MonthlyPartnerRevenue, query: string): boolean {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("vi");
  return [row.name, row.email, row.username, row.phone]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase("vi").includes(needle));
}

export function filterRevenueRows(
  rows: MonthlyPartnerRevenue[],
  filters: RevenueFilters,
): MonthlyPartnerRevenue[] {
  return rows.filter((row) => {
    if (!matchesSearch(row, filters.q)) return false;
    if (filters.type !== "all" && row.partnerType !== filters.type) return false;
    if (filters.status === "active" && !row.isActive) return false;
    if (filters.status === "inactive" && row.isActive) return false;
    // "earning" vẫn giữ NVKD doanh thu 0 vì họ có lương cứng — nếu ẩn thì tổng
    // thù lao phải trả trong tháng sẽ bị thiếu.
    if (filters.rows === "earning" && row.revenue <= 0 && row.remuneration.total <= 0) return false;
    return true;
  });
}

function getSortValue(row: MonthlyPartnerRevenue, sort: RevenueSortKey): string | number {
  switch (sort) {
    case "name":
      return row.name ?? row.username ?? row.email;
    case "revenue":
      return row.revenue;
    case "commission":
      return row.remuneration.commission;
    case "remuneration":
      return row.remuneration.total;
    case "orders":
      return row.orderCount;
    case "customers":
      return row.customerCount;
  }
}

export function sortRevenueRows(
  rows: MonthlyPartnerRevenue[],
  { sort, order }: RevenueSorting,
): MonthlyPartnerRevenue[] {
  const direction = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = getSortValue(a, sort);
    const right = getSortValue(b, sort);
    const result =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right, "vi", { sensitivity: "base" })
        : Number(left) - Number(right);
    return result * direction;
  });
}
