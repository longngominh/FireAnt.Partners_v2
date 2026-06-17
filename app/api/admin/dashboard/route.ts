import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDashboardPerformance } from "@/lib/data/partners";
import { isTrendRange } from "@/lib/data/trend";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawRange = request.nextUrl.searchParams.get("range") ?? undefined;
  const range = isTrendRange(rawRange) ? rawRange : "1M";
  const data = await getAdminDashboardPerformance(range);

  return NextResponse.json(data);
}
