import { redirect } from "next/navigation";

/** Trang cũ — bảng kê theo tháng nay là "Thù lao & chi trả". Giữ đường dẫn cho bookmark. */
export default async function AdminRevenueRedirect({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  redirect(month ? `/admin/payouts?month=${encodeURIComponent(month)}` : "/admin/payouts");
}
