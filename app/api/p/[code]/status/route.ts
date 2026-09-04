import { NextResponse, type NextRequest } from "next/server";
import { getCouponByCode } from "@/lib/data/payment";
import { getOrderByCouponCode } from "@/lib/payment/order-payment";

export const dynamic = "force-dynamic";

/**
 * Trạng thái thanh toán của một link công khai (trang /p/[code] poll mỗi vài giây
 * để tự chuyển sang màn "nâng cấp thành công"). Không cần đăng nhập, chỉ trả về
 * cờ đã thanh toán hay chưa.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const coupon = await getCouponByCode(code);
  if (!coupon) {
    return NextResponse.json({ error: "Không tìm thấy link" }, { status: 404 });
  }

  const order = await getOrderByCouponCode(coupon.code);
  return NextResponse.json(
    {
      paid: order?.isPaid ?? false,
      expired: !(order?.isPaid ?? false) && coupon.expiresAt.getTime() < Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
