import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTrendSeries, getTrendSeriesForPartners, type TrendRange } from "@/lib/data/trend";

const VALID_RANGES: TrendRange[] = ["1W", "1M", "3M", "6M", "1Y", "2Y", "ALL"];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "admin";
  const sp = request.nextUrl.searchParams;

  const rawRange = sp.get("range") ?? "6M";
  const range: TrendRange = (VALID_RANGES.includes(rawRange as TrendRange)
    ? rawRange
    : "6M") as TrendRange;

  // Admin: hỗ trợ partnerIds (comma-separated) hoặc partnerId đơn lẻ
  if (isAdmin) {
    const rawPartnerIds = sp.get("partnerIds");
    if (rawPartnerIds) {
      const ids = rawPartnerIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n > 0);
      const data = await getTrendSeriesForPartners(ids, range);
      return NextResponse.json(data);
    }

    const partnerId = sp.get("partnerId") ? Number(sp.get("partnerId")) : null;
    const data = await getTrendSeries(partnerId, range);
    return NextResponse.json(data);
  }

  // Partner: chỉ lấy data của chính mình
  const data = await getTrendSeries(session.user.partnerId ?? null, range);
  return NextResponse.json(data);
}
