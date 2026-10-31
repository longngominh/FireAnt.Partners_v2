import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";

/**
 * Kiểm tra quyền cho từng không gian. Layout và page render song song nên mỗi trang
 * tự gọi lại (auth() đã được Auth.js cache trong request).
 *
 * Vai trò (xem auth.ts): admin, partner (đối tác/NVKD), staff (nhân viên của đối tác),
 * applicant (đang được đề xuất — chỉ xem trang /status).
 */

export type PortalRole = "partner" | "staff";

export type PortalSession = {
  session: Session;
  /** Partners.PartnerId của người đang đăng nhập — chủ các link họ tạo. */
  partnerId: number;
  role: PortalRole;
};

/** Cổng bán hàng: đối tác hoặc nhân viên của đối tác. */
export async function requirePortalSession(): Promise<PortalSession> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "applicant") redirect("/status");
  const partnerId = Number(session.user.partnerId);
  if (!session.user.partnerId || !Number.isInteger(partnerId)) {
    redirect(session.user.role === "admin" ? "/admin" : "/login?error=AccessDenied");
  }
  return { session, partnerId, role: session.user.role === "staff" ? "staff" : "partner" };
}

/** Trang chỉ dành cho đối tác (thu nhập, nhân viên): nhân viên được đưa về tổng quan. */
export async function requirePartnerSession(): Promise<{ session: Session; partnerId: number }> {
  const portal = await requirePortalSession();
  if (portal.role === "staff") redirect("/dashboard");
  return { session: portal.session, partnerId: portal.partnerId };
}

/** Trang chỉ dành cho nhân viên bán hàng (doanh số của tôi). */
export async function requireStaffSession(): Promise<{ session: Session; partnerId: number }> {
  const portal = await requirePortalSession();
  if (portal.role !== "staff") redirect("/earnings");
  return { session: portal.session, partnerId: portal.partnerId };
}

/** Bảng quản trị: chỉ vai trò quản trị trên accounts.fireant.vn. */
export async function requireAdminSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");
  return session;
}

export function sessionDisplayName(session: Session): string {
  return session.user.name?.trim() || session.user.email?.trim() || "Tài khoản FireAnt";
}
