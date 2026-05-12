import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCouponByCode } from "@/lib/data/payment";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;
  const coupon = await getCouponByCode(code);
  if (!coupon) {
    return NextResponse.json({ error: "Không tìm thấy coupon" }, { status: 404 });
  }

  return NextResponse.json(coupon);
}
