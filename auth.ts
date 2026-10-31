import NextAuth from "next-auth";
import type { OIDCConfig } from "next-auth/providers";
import { getPool, sql } from "@/lib/db/sql";
import { isPartnerStaffType } from "@/lib/commission";
import { getLatestApplicationForUser } from "@/lib/data/staff";
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
  PartnerType: string | null;
};

/**
 * Vai trò trong JWT:
 *   admin     — quản lý FireAnt (role IS4); có thể kiêm đối tác (partnerId).
 *   partner   — đối tác ký hợp đồng (CTV) hoặc NVKD FireAnt.
 *   staff     — nhân viên bán hàng của một đối tác (Partners.PartnerType = partner_staff).
 *   applicant — chưa có quyền bán hàng nhưng có đề xuất đang chờ duyệt / bị từ chối:
 *               chỉ xem được trang trạng thái.
 */
type PortalRole = "partner" | "staff" | "applicant";

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
        "SELECT PartnerId, IsActive, UserName, PartnerType FROM Partners WHERE UserName = @username",
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

function portalRole(partner: PartnerRow): PortalRole {
  return isPartnerStaffType(partner.PartnerType) ? "staff" : "partner";
}

/** Người được đề xuất làm nhân viên nhưng chưa có dòng Partners (chờ duyệt / bị từ chối). */
async function hasOpenApplication(username: string): Promise<boolean> {
  try {
    return (await getLatestApplicationForUser(username)) !== null;
  } catch (err) {
    console.error("[auth] hasOpenApplication error:", err);
    return false;
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

    // Deny login nếu không phải admin IS4, không có dòng Partners đang bật và không có đề xuất
    // nhân viên nào đang chờ duyệt / bị từ chối.
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

      return hasOpenApplication(p?.name ?? "");
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
          // Không phải admin → đối tác, nhân viên của đối tác, hoặc người đang được đề xuất
          const partner = await lookupPartner(p?.name ?? "");
          if (partner !== null && partner.IsActive !== false) {
            token.role = portalRole(partner);
            token.partnerId = String(partner.PartnerId);
            token.userId = partner.UserName;
          } else if (await hasOpenApplication(p?.name ?? "")) {
            token.role = "applicant";
            token.partnerId = null;
            token.userId = p?.name ?? null;
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
