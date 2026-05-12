import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPartnerPerformance } from "@/lib/data/partners";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const data = await getPartnerPerformance(id);
  if (!data) {
    return NextResponse.json({ error: "Không tìm thấy đối tác" }, { status: 404 });
  }

  return NextResponse.json(data);
}
