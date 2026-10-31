import Link from "next/link";
import { UserRoundXIcon } from "lucide-react";
import { countPaidOrdersWithoutAccount } from "@/lib/data/pending-accounts";

/**
 * Badge "đơn chờ tài khoản" trên /payment.
 *
 * Phép đếm phải đối chiếu username của đơn với AspNetUsers nằm trên linked server NEWFA
 * (~0,2–0,5s), nên component này được render trong <Suspense> để bảng coupon hiện ra ngay,
 * không chờ. Không có gì ở đây chặn nội dung chính của trang.
 */
export async function PendingAccountBanner({
  partnerId,
  teamOf = null,
  href = "/payment/pending-account",
}: {
  partnerId: string | number | null;
  /** Đối tác: đếm cả đơn qua link của nhân viên. */
  teamOf?: number | null;
  href?: string;
}) {
  const count = await countPaidOrdersWithoutAccount(partnerId, teamOf);
  if (count <= 0) return null;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm transition-colors hover:bg-warning/15"
    >
      <UserRoundXIcon className="size-4 shrink-0 text-warning" />
      <span className="min-w-0">
        <strong className="font-semibold">{count} đơn đã thu tiền</strong> có email chưa được đăng ký tài
        khoản FireAnt — khách chưa dùng được gói. Bấm để xem và nhắc khách đăng ký.
      </span>
    </Link>
  );
}
