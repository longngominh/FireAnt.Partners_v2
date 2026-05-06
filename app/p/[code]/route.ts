import { NextResponse, type NextRequest } from "next/server";
import { getCouponByShortCode } from "@/lib/data/payment";

const PAYMENT_BASE_URL =
  process.env.PAYMENT_BASE_URL ?? "https://company.fireant.vn/pay";

/** Danh sách domain hợp lệ cho trang thanh toán. */
const ALLOWED_PAYMENT_HOSTS = ["company.fireant.vn", "fireant.vn"];

/**
 * Normalise paymentLink: nếu domain trong DB bị lưu sai (ví dụ partner.fireant.vn/pay
 * thay vì company.fireant.vn/pay), thay bằng host của PAYMENT_BASE_URL hiện tại.
 * Đảm bảo /p/[code] luôn redirect đúng dù link cũ trong DB có domain sai.
 */
function normalisePaymentLink(raw: string): string {
  try {
    const url = new URL(raw);
    if (ALLOWED_PAYMENT_HOSTS.includes(url.hostname)) return raw;
    // Domain sai → thay bằng PAYMENT_BASE_URL giữ nguyên query params
    const base = new URL(PAYMENT_BASE_URL);
    url.hostname = base.hostname;
    url.protocol = base.protocol;
    url.port = base.port;
    url.pathname = base.pathname;
    return url.toString();
  } catch {
    return raw;
  }
}

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
  const rawDestination = coupon.paymentLink || (() => {
    const target = new URL(PAYMENT_BASE_URL);
    target.searchParams.set("coupon", coupon.code);
    return target.toString();
  })();

  const destination = normalisePaymentLink(rawDestination);

  return NextResponse.redirect(destination, 302);
}
