import { redirect } from "next/navigation";
import { isMonthKey } from "@/lib/utils/month";

// Bảng thù lao theo tháng của CTV nay ở /earnings. Giữ route này làm redirect để
// bookmark/link cũ không chết (bảng kê toàn hệ thống của quản lý ở /admin/payouts).
export default async function PartnerRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  redirect(isMonthKey(params.month) ? `/earnings?month=${params.month}` : "/earnings");
}
