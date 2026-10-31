import { auth } from "@/auth";
import { payableAmount } from "@/lib/earnings/explain";
import { getPartnerPaymentInfoMap } from "@/lib/data/partner-payment-info";
import { getMonthlyRevenueReport, listMonthlyPaidOrders } from "@/lib/data/revenue";
import { getStaffDirectory } from "@/lib/data/staff";
import { buildPaymentRequestWorkbook, paymentRequestFilename } from "@/lib/reports/payment-request";
import { normalizeMonthKey } from "@/lib/utils/month";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
  const month = normalizeMonthKey(searchParams.get("month"));

  const report = await getMonthlyRevenueReport({ month });
  // Giấy đề nghị chỉ liệt kê người thực nhận (đối tác và NVKD), bỏ dòng phí/thù lao 0.
  const payable = report.rows
    .filter((row) => row.remuneration.commission > 0)
    .sort((a, b) => payableAmount(b.remuneration) - payableAmount(a.remuneration));

  if (payable.length === 0) {
    return new Response("Không có ai phát sinh phí/thù lao trong tháng đã chọn.", {
      status: 422,
    });
  }

  const [paymentInfo, orders, staff] = await Promise.all([
    getPartnerPaymentInfoMap(),
    listMonthlyPaidOrders(month),
    getStaffDirectory(),
  ]);
  const ordersByPartner = new Map<number, typeof orders>();
  for (const order of orders) {
    const list = ordersByPartner.get(order.partnerId);
    if (list) list.push(order);
    else ordersByPartner.set(order.partnerId, [order]);
  }

  const bytes = await buildPaymentRequestWorkbook({
    month,
    requesterName: searchParams.get("requesterName")?.trim() || session.user.name || "",
    department: searchParams.get("department")?.trim() || "Phòng Kinh doanh",
    city: searchParams.get("city")?.trim() || "Hà Nội",
    issuedAt: parseIssuedAt(searchParams.get("issuedAt")),
    rows: payable.map((row) => {
      const info = paymentInfo.get(row.partnerId);
      return {
        fullName: info?.fullName ?? row.name ?? row.username,
        username: row.username,
        partnerType: row.partnerType,
        // Căn cứ tính: đối tác có phụ lục = DS khách mới; còn lại = DS trừ khóa học.
        revenue: row.remuneration.revenue,
        totalRevenue: row.revenue - row.breakdown.course.revenue,
        policy: row.remuneration.policy,
        tier: row.remuneration.tier,
        commission: row.remuneration.commission,
        bonus: row.remuneration.performanceBonus,
        bankAccountNumber: info?.bankAccountNumber ?? "",
        bankName: info?.bankName ?? "",
        // Khóa học thanh toán riêng ở phần Quản lý khóa học (Admin) nên không có trong bảng kê.
        orders: (ordersByPartner.get(row.partnerId) ?? [])
          .filter((order) => order.kind !== "course")
          .map((order) => ({
            ...order,
            seller: order.sellerId !== row.partnerId ? (staff.get(order.sellerId) ?? null) : null,
          })),
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
