import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listCustomers } from "@/lib/data/customers";

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

  const result = await listCustomers({
    partnerId,
    q:        sp.get("q")        ?? "",
    page:     Number(sp.get("page")     ?? "1") || 1,
    pageSize: Number(sp.get("pageSize") ?? "20") || 20,
  });

  return NextResponse.json(result);
}
