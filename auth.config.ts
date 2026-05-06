import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  // Chạy sau reverse proxy (IIS HTTPS → Node.js HTTP):
  // NextAuth dùng __Secure- prefix khi AUTH_URL là https://, nhưng Node.js
  // nhận HTTP từ IIS nên các cookie (session, PKCE, state, nonce) bị mismatch.
  // Override toàn bộ để bỏ prefix, secure=false ở tầng Node.js
  // (HTTPS vẫn được IIS đảm bảo ở lớp ngoài).
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
    callbackUrl: {
      name: "authjs.callback-url",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
    csrfToken: {
      name: "authjs.csrf-token",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
    pkceCodeVerifier: {
      name: "authjs.pkce.code_verifier",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
    state: {
      name: "authjs.state",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
    nonce: {
      name: "authjs.nonce",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isLoggedIn = !!auth?.user;

      const isPublic =
        path === "/login" ||
        path === "/api/signin" ||
        path.startsWith("/p/") ||
        path.startsWith("/api/auth") ||
        path.startsWith("/_next") ||
        path === "/favicon.ico";

      if (isPublic) {
        if (isLoggedIn && path === "/login") {
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) return false;

      if (path.startsWith("/admin")) {
        return auth?.user?.role === "admin";
      }

      return true;
    },
    // Edge-safe: read role/partnerId already stored in the JWT
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub ?? "") as string;
        session.user.role = (token.role as string) ?? "partner";
        session.user.partnerId = (token.partnerId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
