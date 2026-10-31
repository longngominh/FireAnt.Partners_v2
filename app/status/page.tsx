import Image from "next/image";
import { redirect } from "next/navigation";
import { CircleXIcon, ClockIcon } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { getLatestApplicationForUser } from "@/lib/data/staff";
import { formatDay } from "@/lib/utils/month";

export const metadata = { title: "Trạng thái tài khoản" };

/**
 * Trang của người đang được đề xuất làm nhân viên (vai trò applicant): chờ FireAnt duyệt
 * hoặc bị từ chối kèm lý do. Đã có quyền bán hàng thì về tổng quan.
 */
export default async function ApplicantStatusPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "applicant") redirect(session.user.role === "admin" ? "/admin" : "/dashboard");

  const application = await getLatestApplicationForUser(session.user.userId ?? "");

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const isPending = application?.status === "pending";
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b bg-card px-5 py-3">
        <span className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-lg" />
          <span className="text-sm font-bold">FireAnt Partners</span>
        </span>
        <form action={signOutAction} className="flex items-center gap-3 text-[13px] text-muted-foreground">
          {session.user.email}
          <button type="submit" className="font-semibold text-primary hover:underline">
            Đăng xuất
          </button>
        </form>
      </header>
      <main className="flex flex-1 justify-center px-4 py-12">
        <div className="flex w-full max-w-lg flex-col gap-5 self-start rounded-2xl border bg-card p-7 shadow-xs">
          {application && isPending ? (
            <>
              <span className="flex size-12 items-center justify-center rounded-full bg-warning/15 text-warning">
                <ClockIcon className="size-6" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h1 className="text-xl font-bold">Tài khoản đang chờ FireAnt duyệt</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  Đối tác {application.partnerName} đã đề xuất bạn làm nhân viên bán hàng ngày {formatDay(application.createdAt)}.
                  FireAnt kiểm tra trong 1–2 ngày làm việc. Khi được duyệt, đăng xuất rồi đăng nhập lại để bắt đầu bán hàng.
                </p>
              </div>
              <ol className="flex flex-col gap-2.5 text-sm">
                <li className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-success" />
                  Đối tác đề xuất · {formatDay(application.createdAt)}
                </li>
                <li className="flex items-center gap-2.5 font-semibold">
                  <span className="size-2.5 rounded-full bg-warning" />
                  FireAnt duyệt · đang chờ
                </li>
                <li className="flex items-center gap-2.5 text-muted-foreground">
                  <span className="size-2.5 rounded-full bg-muted-foreground/50" />
                  Tạo link bán hàng
                </li>
              </ol>
              <p className="text-[13px] leading-5 text-muted-foreground">
                Trong thời gian chờ, bạn chưa tạo được link. Đơn khách mua lúc này không tính cho đối tác.
              </p>
            </>
          ) : application ? (
            <>
              <span className="flex size-12 items-center justify-center rounded-full bg-destructive/12 text-destructive">
                <CircleXIcon className="size-6" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h1 className="text-xl font-bold">Đề xuất không được duyệt</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  Ngày {formatDay(application.reviewedAt ?? application.createdAt)}, FireAnt từ chối đề xuất bạn làm nhân viên bán
                  hàng của đối tác {application.partnerName}.
                </p>
              </div>
              <div className="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                <span className="text-xs font-semibold text-destructive">Lý do</span>
                <span className="text-sm font-semibold">{application.rejectReason ?? "Không có lý do kèm theo."}</span>
              </div>
              <p className="text-sm leading-6 text-foreground/85">
                Nếu bạn đã thôi bán hàng cho đối tác khác, nhờ họ ngừng hợp tác với bạn, sau đó đối tác {application.partnerName} gửi
                lại đề xuất.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold">Tài khoản này chưa dùng được FireAnt Partners</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                FireAnt Partners dành cho đối tác đã ký hợp đồng với FireAnt và nhân viên bán hàng đã được duyệt của họ.
              </p>
            </>
          )}
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              Đăng nhập bằng tài khoản khác
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
