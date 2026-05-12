import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listCoupons, createCoupon, type CouponStatus } from "@/lib/data/payment";
import { generateShortCode, buildShortLink } from "@/lib/utils/shortcode";
import { qrToDataUrl } from "@/lib/utils/qr";
import { createPaymentSchema } from "@/lib/validations/payment";

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

  const result = await listCoupons({
    partnerId,
    status:   (sp.get("status") ?? "ALL") as CouponStatus | "ALL",
    q:        sp.get("q")        ?? "",
    page:     Number(sp.get("page")     ?? "1") || 1,
    pageSize: Number(sp.get("pageSize") ?? "20") || 20,
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerId = session.user.partnerId;
  if (!partnerId) {
    return NextResponse.json(
      { error: "Tài khoản chưa được gán đối tác — không thể tạo link." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body không hợp lệ." }, { status: 400 });
  }

  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dữ liệu không hợp lệ.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  try {
    const code = generateShortCode(8);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const shortLink = buildShortLink(baseUrl, code);

    const paymentBaseUrl = process.env.PAYMENT_BASE_URL ?? "https://fireant.vn/checkout";
    const paymentUrl = new URL(paymentBaseUrl);
    paymentUrl.searchParams.set("packageId", String(parsed.data.packageId));
    paymentUrl.searchParams.set("paymentMethod", "1");
    paymentUrl.searchParams.set("couponCode", code);
    if (parsed.data.customerEmail?.trim()) {
      paymentUrl.searchParams.set("userName", parsed.data.customerEmail.trim());
    }

    await createCoupon({
      partnerId,
      code,
      paymentLink: paymentUrl.toString(),
      userName: parsed.data.customerEmail?.trim() || null,
      note: parsed.data.note?.trim() || null,
    });

    const qrDataUrl = await qrToDataUrl(shortLink);

    return NextResponse.json({
      ok: true,
      code,
      shortLink,
      qrDataUrl,
      orderAmount: parsed.data.amount,
      customerEmail: parsed.data.customerEmail?.trim() || null,
      note: parsed.data.note?.trim() || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tạo link thất bại.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
