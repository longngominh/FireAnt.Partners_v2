import { signIn } from "@/auth";
import type { NextRequest } from "next/server";

/**
 * Route Handler để trigger IS4 OIDC sign-in.
 * signIn() chỉ được gọi từ Server Action hoặc Route Handler (cần set CSRF cookie).
 * /login page redirect về đây thay vì gọi signIn() trực tiếp.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("callbackUrl") ?? "/dashboard";
  // Chỉ cho phép relative URL (bắt đầu bằng /) để tránh redirect về IS4 URL
  // hoặc bất kỳ external URL nào gây redirect loop.
  const callbackUrl = raw.startsWith("/") ? raw : "/dashboard";
  await signIn("identity-server4", { redirectTo: callbackUrl });
}
