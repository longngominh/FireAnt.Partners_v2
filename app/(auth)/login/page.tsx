import { signIn } from "@/auth";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

export const metadata = { title: "Đăng nhập" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string; loggedout?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error, callbackUrl, loggedout } = await searchParams;

  // Vừa logout → hiển thị trang đăng nhập, không auto-redirect (tránh IS4 auto-login lại)
  const showLoginForm = !!error || !!loggedout;

  // Không có lỗi và không vừa logout → redirect sang Route Handler để trigger IS4
  // (signIn() phải gọi từ Route Handler/Server Action, không được gọi trong page render)
  if (!showLoginForm) {
    const dest = callbackUrl
      ? `/api/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/api/signin";
    redirect(dest);
  }

  const signinDest = callbackUrl
    ? `/api/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/api/signin";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src="/logo.png"
            alt="FireAnt"
            width={56}
            height={56}
            className="rounded-2xl shadow-sm"
          />
          <div className="text-center">
            <h1 className="text-xl font-semibold">FireAnt Partners</h1>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error === "AccessDenied" ? (
              <p>
                Tài khoản của bạn chưa được cấp quyền truy cập hệ thống đối tác.
                Vui lòng liên hệ quản trị viên.
              </p>
            ) : (
              <p>Đăng nhập thất bại. Vui lòng thử lại.</p>
            )}
          </div>
        )}

        <a
          href={signinDest}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Image
            src="/logo.png"
            alt="FireAnt"
            width={16}
            height={16}
            className="rounded-sm"
          />
          {error ? "Thử đăng nhập lại" : "Đăng nhập với FireAnt"}
        </a>
      </div>
    </div>
  );
}
