import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isMonthKey } from "@/lib/utils/month";

// Trang doanh thu & hoa hồng đã được gộp vào /dashboard.
// Giữ route này làm redirect để bookmark/link cũ không chết.
export default async function PartnerRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (session?.user.role === "admin") redirect("/admin/revenue");

  const params = await searchParams;
  redirect(
    isMonthKey(params.month) ? `/dashboard?month=${params.month}` : "/dashboard",
  );
}
