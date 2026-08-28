import {
  TrendingUpIcon,
  ClockIcon,
  WalletIcon,
  TicketIcon,
  UsersIcon,
  TargetIcon,
  GraduationCapIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HeroTile, KpiTile } from "@/components/features/dashboard/kpi-tile";
import { TrendChart } from "@/components/features/dashboard/trend-chart";
import { StatusChart } from "@/components/features/dashboard/status-chart";
import { CommissionProgress } from "@/components/features/dashboard/commission-progress";
import { MonthPicker } from "@/components/features/revenue/month-picker";
import { ExportCsvButton } from "@/components/features/revenue/export-csv-button";
import { getDashboardStats } from "@/lib/data/dashboard";
import { getMonthlyRevenueReport, sumMonthlyTotals } from "@/lib/data/revenue";
import {
  calcCommissionFromTotal,
  calcMonthlyRemuneration,
  normalizePartnerType,
  PARTNER_TYPE_LABELS,
} from "@/lib/commission";
import {
  currentMonthKey,
  formatMonthLabel,
  formatMonthRangeLabel,
  normalizeMonthKey,
} from "@/lib/utils/month";
import { formatVND, formatNumber } from "@/lib/utils/currency";

export const metadata = { title: "Tổng quan" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  const isAdmin = session?.user.role === "admin";

  if (isAdmin) {
    return <AdminDashboard />;
  }

  const partnerId = session?.user.partnerId ?? null;
  const partnerIdNum = partnerId ? Number(partnerId) : null;

  const params = await searchParams;
  const month = normalizeMonthKey(params.month);
  const isCurrentMonth = month === currentMonthKey();

  const [stats, report] = await Promise.all([
    getDashboardStats(partnerId, month),
    partnerIdNum !== null && !isNaN(partnerIdNum)
      ? getMonthlyRevenueReport({ month, partnerId: partnerIdNum })
      : Promise.resolve(null),
  ]);

  const row = report?.rows[0] ?? null;
  const partnerType = row?.partnerType ?? normalizePartnerType(null);
  const remuneration =
    row?.remuneration ?? calcMonthlyRemuneration(stats.totalRevenue, partnerType);

  // Tính lại các số phụ thuộc bậc hoa hồng theo đúng loại đối tác
  // (getDashboardStats mặc định dùng bậc NVKD).
  const paidCommission = calcCommissionFromTotal(stats.totalRevenue, partnerType);
  const pendingCommission = Math.max(
    0,
    calcCommissionFromTotal(stats.totalRevenue + stats.pendingRevenue, partnerType) -
      paidCommission,
  );
  const trendData = stats.monthlySeries.map((p) => ({
    period: p.month,
    revenue: p.revenue,
    commission: calcCommissionFromTotal(p.revenue, partnerType),
  }));

  const monthLabel = formatMonthLabel(month).toLowerCase();

  const lineItems = [
    {
      label: "Lương cứng",
      hint:
        remuneration.baseSalary > 0
          ? "Theo chính sách nhân viên kinh doanh"
          : "Không áp dụng",
      amount: remuneration.baseSalary,
    },
    {
      label: "Hoa hồng",
      hint: "Tính lũy tiến theo bậc doanh thu trong tháng",
      amount: remuneration.commission,
      highlight: true,
    },
    {
      label: "Thưởng doanh số",
      hint:
        remuneration.performanceBonus > 0
          ? "Đạt mốc thưởng của tháng"
          : "Chưa đạt mốc thưởng",
      amount: remuneration.performanceBonus,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">
            Hoa hồng, doanh thu và hiệu suất {monthLabel} ({formatMonthRangeLabel(month)}).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} basePath="/dashboard" />
          {row ? (
            <ExportCsvButton rows={[row]} totals={sumMonthlyTotals([row])} month={month} />
          ) : null}
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
        <HeroTile
          label={`Tổng doanh thu ${monthLabel}`}
          value={formatVND(remuneration.total)}
          hint={`Doanh số ${formatVND(stats.totalRevenue)} từ ${stats.couponsPaid} coupon đã thanh toán. Hoa hồng ${formatVND(remuneration.commission)}${
            remuneration.performanceBonus > 0
              ? ` + thưởng ${formatVND(remuneration.performanceBonus)}`
              : ""
          }${
            remuneration.baseSalary > 0
              ? ` + lương cứng ${formatVND(remuneration.baseSalary)}`
              : ""
          }.`}
          icon={<TrendingUpIcon className="size-5" />}
          className="col-span-2 row-span-2 lg:col-span-2"
        />
        <KpiTile
          label="Doanh số hội viên"
          value={formatVND(stats.membershipRevenue)}
          hint="Gói Thiết yếu / Chuyên nghiệp / Cao cấp đã thanh toán trong tháng"
          accent="info"
          icon={<WalletIcon className="size-4" />}
        />
        <KpiTile
          label="Doanh số khóa học"
          value={formatVND(stats.courseRevenue)}
          hint="Các khóa học đã thanh toán trong tháng"
          accent="brand"
          icon={<GraduationCapIcon className="size-4" />}
        />
        {isCurrentMonth ? (
          <KpiTile
            label="Hoa hồng chờ (ước tính)"
            value={formatVND(pendingCommission)}
            hint={`Nếu tất cả ${stats.couponsCreated - stats.allTimePaid} coupon đang chờ được thanh toán tháng này.`}
            accent="warning"
            icon={<ClockIcon className="size-4" />}
          />
        ) : (
          <KpiTile
            label="Khách hàng trong tháng"
            value={formatNumber(stats.customersServed)}
            hint="Số khách duy nhất đã thanh toán trong tháng"
            icon={<UsersIcon className="size-4" />}
          />
        )}
        <KpiTile
          label="Link thanh toán đã tạo (tổng)"
          value={formatNumber(stats.couponsCreated)}
          hint={`Trong đó ${stats.allTimePaid} đã thanh toán`}
          icon={<TicketIcon className="size-4" />}
        />
      </div>

      {/* Chi tiết doanh thu */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Chi tiết doanh thu {monthLabel}</p>
            <p className="text-xs text-muted-foreground">
              Trên doanh số {formatVND(remuneration.revenue)}
              {row
                ? ` từ ${formatNumber(row.orderCount)} đơn đã thanh toán của ${formatNumber(row.customerCount)} khách`
                : ""}
              . Tỷ lệ hiệu dụng:{" "}
              {remuneration.revenue > 0
                ? `${(remuneration.effectiveRate * 100).toFixed(1)}%`
                : "—"}
            </p>
          </div>
          <Badge variant="outline">{PARTNER_TYPE_LABELS[partnerType]}</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Khoản mục</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((item) => (
              <TableRow key={item.label}>
                <TableCell>
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.hint}</span>
                  </div>
                </TableCell>
                <TableCell
                  className={`num text-right text-sm ${
                    item.highlight ? "font-semibold text-success" : ""
                  }`}
                >
                  {formatVND(item.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-muted/50">
              <TableCell className="text-sm font-semibold">Tổng doanh thu tháng</TableCell>
              <TableCell className="num text-right text-base font-semibold">
                {formatVND(remuneration.total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {/* Conversion + Trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <TrendChart initialData={trendData} partnerId={partnerId ?? null} />
        <div className="flex flex-col gap-4">
          {isCurrentMonth ? (
            <>
              <CommissionProgress
                monthlyRevenue={stats.totalRevenue}
                partnerType={partnerType}
              />
              <KpiTile
                label="Khách hàng tháng này"
                value={formatNumber(stats.customersServed)}
                hint="Số khách duy nhất đã thanh toán trong tháng"
                icon={<UsersIcon className="size-4" />}
              />
            </>
          ) : null}
          <KpiTile
            label="Tỷ lệ thanh toán (tổng)"
            value={`${stats.conversionRate.toFixed(1)}%`}
            hint="Coupon đã thanh toán / tổng coupon đã tạo (all-time)"
            accent="brand"
            icon={<TargetIcon className="size-4" />}
            className="flex-1"
          />
          <StatusChart data={stats.statusBreakdown} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Doanh số được ghi nhận theo ngày thanh toán của đơn hàng, tính từ ngày 1 đến hết ngày
        cuối cùng của tháng. Hoa hồng reset về bậc đầu tiên vào đầu mỗi tháng.
      </p>
    </div>
  );
}

async function AdminDashboard() {
  const stats = await getDashboardStats(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tổng quan toàn hệ thống</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi hoa hồng, doanh thu và hiệu suất theo thời gian thực.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
        <HeroTile
          label="Hoa hồng tháng này"
          value={formatVND(stats.netReceived)}
          hint={`Từ ${stats.couponsPaid} coupon đã thanh toán trong tháng. Doanh số: ${formatVND(stats.totalRevenue)}.`}
          icon={<TrendingUpIcon className="size-5" />}
          className="col-span-2 row-span-2 lg:col-span-2"
        />
        <KpiTile
          label="Hoa hồng chờ (ước tính)"
          value={formatVND(stats.pendingAmount)}
          hint={`Nếu tất cả ${stats.couponsCreated - stats.allTimePaid} coupon đang chờ được thanh toán tháng này.`}
          accent="warning"
          icon={<ClockIcon className="size-4" />}
        />
        <KpiTile
          label="Doanh số hội viên"
          value={formatVND(stats.membershipRevenue)}
          hint="Gói Thiết yếu / Chuyên nghiệp / Cao cấp đã thanh toán trong tháng"
          accent="info"
          icon={<WalletIcon className="size-4" />}
        />
        <KpiTile
          label="Doanh số khóa học"
          value={formatVND(stats.courseRevenue)}
          hint="Các khóa học đã thanh toán trong tháng"
          accent="brand"
          icon={<GraduationCapIcon className="size-4" />}
        />
        <KpiTile
          label="Link thanh toán đã tạo (tổng)"
          value={formatNumber(stats.couponsCreated)}
          hint={`Trong đó ${stats.allTimePaid} đã thanh toán`}
          icon={<TicketIcon className="size-4" />}
        />
      </div>

      {/* Conversion + Trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <TrendChart
          initialData={stats.monthlySeries.map((p) => ({
            period: p.month,
            revenue: p.revenue,
            commission: p.commission,
          }))}
          partnerId={null}
        />
        <div className="flex flex-col gap-4">
          <KpiTile
            label="Khách hàng tháng này"
            value={formatNumber(stats.customersServed)}
            hint="Số khách duy nhất đã thanh toán trong tháng"
            icon={<UsersIcon className="size-4" />}
          />
          <KpiTile
            label="Tỷ lệ thanh toán (tổng)"
            value={`${stats.conversionRate.toFixed(1)}%`}
            hint="Coupon đã thanh toán / tổng coupon đã tạo (all-time)"
            accent="brand"
            icon={<TargetIcon className="size-4" />}
            className="flex-1"
          />
          <StatusChart data={stats.statusBreakdown} />
        </div>
      </div>
    </div>
  );
}
