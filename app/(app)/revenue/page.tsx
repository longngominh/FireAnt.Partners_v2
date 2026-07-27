import { redirect } from "next/navigation";
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
import { MonthPicker } from "@/components/features/revenue/month-picker";
import { ExportCsvButton } from "@/components/features/revenue/export-csv-button";
import { getMonthlyRevenueReport, sumMonthlyTotals } from "@/lib/data/revenue";
import { formatMonthLabel, formatMonthRangeLabel, normalizeMonthKey } from "@/lib/utils/month";
import { formatNumber, formatVND } from "@/lib/utils/currency";

export const metadata = { title: "Doanh thu & hoa hồng của tôi" };

const BASE_PATH = "/revenue";

export default async function PartnerRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  const partnerId = session?.user.partnerId ? Number(session.user.partnerId) : null;
  if (!partnerId) {
    if (session?.user.role === "admin") redirect("/admin/revenue");
    redirect("/dashboard");
  }

  const params = await searchParams;
  const month = normalizeMonthKey(params.month);
  const report = await getMonthlyRevenueReport({ month, partnerId });
  const row = report.rows[0];

  if (!row) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Doanh thu & hoa hồng</h1>
        <MonthPicker month={month} basePath={BASE_PATH} />
        <Card className="border-dashed py-16 text-center text-sm text-muted-foreground">
          Không tìm thấy dữ liệu cộng tác viên cho tài khoản này.
        </Card>
      </div>
    );
  }

  const { remuneration } = row;
  const lineItems = [
    {
      label: "Lương cứng",
      hint: remuneration.baseSalary > 0 ? "Theo chính sách nhân viên kinh doanh" : "Không áp dụng",
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
          <h1 className="text-2xl font-semibold tracking-tight">Doanh thu & hoa hồng</h1>
          <p className="text-sm text-muted-foreground">
            Bảng kê {formatMonthLabel(month).toLowerCase()} ({formatMonthRangeLabel(month)}) của{" "}
            {row.name ?? row.username}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} basePath={BASE_PATH} />
          <ExportCsvButton rows={[row]} totals={sumMonthlyTotals([row])} month={month} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Doanh thu</p>
          <p className="num mt-1 text-xl font-semibold">{formatVND(row.revenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Hoa hồng</p>
          <p className="num mt-1 text-xl font-semibold text-success">
            {formatVND(remuneration.commission)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Tổng thù lao</p>
          <p className="num mt-1 text-xl font-semibold">{formatVND(remuneration.total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Tỷ lệ hiệu dụng</p>
          <p className="num mt-1 text-xl font-semibold">
            {row.revenue > 0 ? `${(remuneration.effectiveRate * 100).toFixed(1)}%` : "—"}
          </p>
          <Badge variant="outline" className="mt-2 w-fit">
            {row.partnerTypeLabel}
          </Badge>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/20 px-4 py-3">
          <p className="text-sm font-medium">Chi tiết thù lao</p>
          <p className="text-xs text-muted-foreground">
            Trên doanh thu {formatVND(row.revenue)} từ {formatNumber(row.orderCount)} đơn đã thanh
            toán của {formatNumber(row.customerCount)} khách.
          </p>
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
              <TableCell className="text-sm font-semibold">Tổng thù lao tháng</TableCell>
              <TableCell className="num text-right text-base font-semibold">
                {formatVND(remuneration.total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Doanh thu được ghi nhận theo ngày thanh toán của đơn hàng, tính từ ngày 1 đến hết ngày cuối
        cùng của tháng. Hoa hồng reset về bậc đầu tiên vào đầu mỗi tháng.
      </p>
    </div>
  );
}
