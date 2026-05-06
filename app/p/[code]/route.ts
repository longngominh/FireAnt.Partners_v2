import { NextResponse, type NextRequest } from "next/server";
import { getCouponByShortCode } from "@/lib/data/payment";

const PAYMENT_BASE_URL =
  process.env.PAYMENT_BASE_URL ?? "https://fireant.vn/checkout";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const coupon = await getCouponByShortCode(code);

  if (!coupon) {
    return new NextResponse("Link không tồn tại hoặc đã bị thu hồi.", {
      status: 404,
    });
  }

  if (coupon.status === "EXPIRED") {
    return new NextResponse("Link đã hết hạn.", { status: 410 });
  }

  // paymentLink chứa URL đích đầy đủ (packageId, couponCode, userName, v.v.)
  const destination = coupon.paymentLink || (() => {
    const target = new URL(PAYMENT_BASE_URL);
    target.searchParams.set("coupon", coupon.code);
    return target.toString();
  })();

  return NextResponse.redirect(destination, 302);
}
