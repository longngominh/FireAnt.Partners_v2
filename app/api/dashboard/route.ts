import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDashboardStats } from "@/lib/data/dashboard";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "admin";
  const sp = request.nextUrl.searchParams;

  const partnerId = isAdmin
    ? (sp.get("partnerId") ?? null)
    : (session.user.partnerId ?? null);

  const stats = await getDashboardStats(partnerId);
  return NextResponse.json(stats);
}
