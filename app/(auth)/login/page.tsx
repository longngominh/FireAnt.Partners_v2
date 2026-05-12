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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 px-4 py-12">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="rounded-2xl border bg-card p-8 shadow-xl shadow-black/5">
          {/* Logo + Brand */}
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-primary/10 blur-md" />
              <Image
                src="/logo.png"
                alt="FireAnt"
                width={60}
                height={60}
                className="relative rounded-2xl shadow-md"
              />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">FireAnt Partners</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Nền tảng quản lý đối tác
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {error === "AccessDenied" ? (
                <p className="leading-relaxed">
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
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 hover:shadow-md active:scale-[0.99]"
          >
            <Image
              src="/logo.png"
              alt="FireAnt"
              width={18}
              height={18}
              className="rounded-sm"
            />
            {error ? "Thử đăng nhập lại" : "Đăng nhập với tài khoản FireAnt"}
          </a>

          <p className="mt-4 text-center text-[11px] text-muted-foreground/60">
            Chỉ dành cho đối tác được cấp quyền
          </p>
        </div>
      </div>
    </div>
  );
}
