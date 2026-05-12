import NextAuth from "next-auth";
import type { OIDCConfig } from "next-auth/providers";
import { getPool, sql } from "@/lib/db/sql";
import { authConfig } from "./auth.config";

type IS4Profile = {
  sub: string;
  name?: string;
  full_name?: string;
  email?: string;
  role?: string | string[];  // IS4 roles claim
};

type PartnerRow = {
  PartnerId: number;
  IsActive: boolean | null;
  UserName: string;
};

const is4BaseUrl = process.env.AUTH_IS4_ISSUER ?? "https://accounts.fireant.vn";

const IdentityServer4: OIDCConfig<IS4Profile> = {
  id: "identity-server4",
  name: "FireAnt",
  type: "oidc",
  issuer: is4BaseUrl,
  clientId: process.env.AUTH_IS4_CLIENT_ID!,
  clientSecret: process.env.AUTH_IS4_CLIENT_SECRET!,
  // Hardcode endpoints để không phụ thuộc OIDC discovery (tránh fallback sai URL)
  authorization: {
    url: `${is4BaseUrl}/connect/authorize`,
    params: { scope: "openid profile roles email" },
  },
  token: `${is4BaseUrl}/connect/token`,
  userinfo: `${is4BaseUrl}/connect/userinfo`,
  jwks_endpoint: `${is4BaseUrl}/.well-known/openid-configuration/jwks`,
  profile(profile) {
    return {
      id: profile.sub,
      name: profile.full_name ?? profile.name ?? "",
      // accounts.fireant.vn trả email trong claim "name" (giống Stockbiz/commodities)
      email: profile.name ?? profile.email ?? "",
    };
  },
};

/** Lookup partner từ bảng Partners theo UserName */
async function lookupPartner(
  username: string,
): Promise<PartnerRow | null> {
  try {
    const pool = await getPool();

    const r = await pool
      .request()
      .input("username", sql.NVarChar(256), username)
      .query<PartnerRow>(
        "SELECT PartnerId, IsActive, UserName FROM Partners WHERE UserName = @username",
      );

    if (r.recordset[0]) {
      console.log("[auth] lookupPartner by UserName →", r.recordset[0]);
      return r.recordset[0];
    }

    console.log("[auth] lookupPartner: not found — username=", username);
    return null;
  } catch (err) {
    console.error("[auth] lookupPartner error:", err);
    return null;
  }
}

/** Kiểm tra IS4 roles claim có chứa admin role không */
function hasAdminRole(roles: string | string[] | undefined): boolean {
  const adminRole = process.env.AUTH_ADMIN_ROLE ?? "admin";
  if (!roles) return false;
  if (Array.isArray(roles)) return roles.includes(adminRole);
  return roles === adminRole;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [IdentityServer4],
  callbacks: {
    authorized: authConfig.callbacks!.authorized!,

    // Deny login nếu không phải partner active và không phải admin IS4
    async signIn({ user, profile }) {
      const sub = user.id;
      if (!sub) return false;

      // Debug: log claims để xác định role name trong IS4
      console.log("[auth] signIn profile:", JSON.stringify(profile));

      const p = profile as IS4Profile | undefined;

      // Admin IS4 luôn được phép
      if (hasAdminRole(p?.role)) return true;

      // Kiểm tra partner trong DB — IsActive null nghĩa là chưa set, coi là active
      const partner = await lookupPartner(p?.name ?? "");
      if (partner !== null && partner.IsActive !== false) return true;

      return false;
    },

    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;

        const sub = token.sub ?? "";
        const p = profile as IS4Profile | undefined;

        // Admin IS4 được ưu tiên trước — dù có trong Partners vẫn là admin
        if (hasAdminRole(p?.role)) {
          token.role = "admin";
          token.partnerId = null;
        } else {
          // Không phải admin → kiểm tra partner trong DB
          const partner = await lookupPartner(p?.name ?? "");
          if (partner !== null && partner.IsActive !== false) {
            token.role = "partner";
            token.partnerId = String(partner.PartnerId);
            token.userId = partner.UserName;
          } else {
            token.role = null;
            token.partnerId = null;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as string) ?? "partner";
        session.user.partnerId = (token.partnerId as string | null) ?? null;
        session.user.userId = (token.userId as string | null) ?? null;
        session.accessToken = token.accessToken as string | undefined;
      }
      return session;
    },
  },
});
