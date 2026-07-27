import { auth } from "@/auth";
import { getPartnerPaymentInfoMap } from "@/lib/data/partner-payment-info";
import { getMonthlyRevenueReport } from "@/lib/data/revenue";
import {
  filterRevenueRows,
  parseRevenueFilters,
  parseRevenueSorting,
  sortRevenueRows,
} from "@/lib/data/revenue-view";
import { buildPaymentRequestWorkbook, paymentRequestFilename } from "@/lib/reports/payment-request";
import { normalizeMonthKey } from "@/lib/utils/month";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function paramsToRecord(searchParams: URLSearchParams): Record<string, string | undefined> {
  return Object.fromEntries(searchParams.entries());
}

function parseIssuedAt(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const raw = paramsToRecord(searchParams);
  const month = normalizeMonthKey(raw.month);

  const report = await getMonthlyRevenueReport({ month });
  const visible = sortRevenueRows(
    filterRevenueRows(report.rows, parseRevenueFilters(raw)),
    parseRevenueSorting(raw),
  );
  // Giấy đề nghị chỉ liệt kê người thực nhận hoa hồng, bỏ dòng hoa hồng 0.
  const payable = visible.filter((row) => row.remuneration.commission > 0);

  if (payable.length === 0) {
    return new Response("Không có cộng tác viên nào phát sinh hoa hồng trong tháng đã chọn.", {
      status: 422,
    });
  }

  const paymentInfo = await getPartnerPaymentInfoMap();
  const bytes = await buildPaymentRequestWorkbook({
    month,
    requesterName: raw.requesterName?.trim() || session.user.name || "",
    department: raw.department?.trim() || "Phòng Kinh doanh",
    city: raw.city?.trim() || "Hà Nội",
    issuedAt: parseIssuedAt(searchParams.get("issuedAt")),
    rows: payable.map((row) => {
      const info = paymentInfo.get(row.partnerId);
      return {
        fullName: info?.fullName ?? row.name ?? row.username,
        username: row.username,
        revenue: row.revenue,
        commission: row.remuneration.commission,
        bankAccountNumber: info?.bankAccountNumber ?? "",
        bankName: info?.bankName ?? "",
      };
    }),
  });

  const filename = paymentRequestFilename(month);
  return new Response(bytes, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
