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
  const adminRoles = new Set(
    [
      process.env.AUTH_ADMIN_ROLE ?? "admin",
      "Administrator",
      "PartnerAdmin",
    ].filter(Boolean),
  );
  if (!roles) return false;
  if (Array.isArray(roles)) return roles.some((role) => adminRoles.has(role));
  return adminRoles.has(roles);
}

function isGuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

async function getAvatarUserIdFromUserInfo(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${is4BaseUrl}/connect/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const profile = (await res.json()) as Partial<IS4Profile>;
    return isGuid(profile.sub) ? profile.sub : null;
  } catch (err) {
    console.warn("[auth] getAvatarUserIdFromUserInfo failed", err);
    return null;
  }
}

function getAvatarUserId(tokenAvatarUserId: unknown, tokenSub: unknown): string | null {
  if (isGuid(tokenAvatarUserId)) return tokenAvatarUserId;
  if (isGuid(tokenSub)) return tokenSub;
  return null;
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

        const p = profile as IS4Profile | undefined;
        token.avatarUserId = p?.sub ?? token.sub ?? null;

        // Admin IS4 vẫn giữ quyền admin, nhưng nếu cũng là partner thì giữ partnerId
        // để dùng các chức năng tạo link của partner.
        if (hasAdminRole(p?.role)) {
          token.role = "admin";
          const partner = await lookupPartner(p?.name ?? "");
          token.partnerId =
            partner !== null && partner.IsActive !== false
              ? String(partner.PartnerId)
              : null;
          token.userId = partner?.UserName ?? null;
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

      if (
        (!isGuid(token.avatarUserId) || token.avatarUserId === token.sub) &&
        typeof token.accessToken === "string"
      ) {
        token.avatarUserId = await getAvatarUserIdFromUserInfo(token.accessToken);
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as string) ?? "partner";
        session.user.partnerId = (token.partnerId as string | null) ?? null;
        session.user.userId = (token.userId as string | null) ?? null;
        session.user.avatarUserId = getAvatarUserId(token.avatarUserId, token.sub);
        session.accessToken = token.accessToken as string | undefined;
      }
      return session;
    },
  },
});
