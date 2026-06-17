import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getCouponByCode } from "@/lib/data/payment";
import { getOrCreatePartnerPaymentOrder } from "@/lib/payment/order-payment";

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

  if (!coupon.paymentLink) {
    return NextResponse.json({ error: "Coupon chưa có link thanh toán." }, { status: 400 });
  }

  try {
    const paymentOrder = await getOrCreatePartnerPaymentOrder({
      couponCode: coupon.code,
      paymentLink: coupon.paymentLink,
      note: coupon.note,
      staff: session.user.email?.trim() || session.user.id || "partner",
    });

    return NextResponse.json(paymentOrder);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không tạo được QR thanh toán.";
    if (message.includes("đã thanh toán")) {
      return NextResponse.json({ error: message, code: "ORDER_PAID" }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
