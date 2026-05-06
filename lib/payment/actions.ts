"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createPaymentSchema } from "@/lib/validations/payment";
import { createCoupon } from "@/lib/data/payment";
import { generateShortCode, buildShortLink } from "@/lib/utils/shortcode";
import { qrToDataUrl } from "@/lib/utils/qr";
import { getPartner } from "@/lib/data/partners";

import type { CreatePaymentState } from "@/lib/payment/types";

export async function createPaymentAction(
  _prev: CreatePaymentState,
  formData: FormData,
): Promise<CreatePaymentState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

  const partnerId = session.user.partnerId;
  if (!partnerId) {
    return { ok: false, error: "Tài khoản chưa được gán đối tác — không thể tạo link." };
  }

  const parsed = createPaymentSchema.safeParse({
    packageId: formData.get("packageId"),
    amount: formData.get("amount"),
    customerEmail: formData.get("customerEmail") ?? "",
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Dữ liệu không hợp lệ.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const code = generateShortCode(8);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const shortLink = buildShortLink(baseUrl, code);

    // Xây dựng URL thanh toán thực tế với packageId, couponCode và userName
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
      userName: parsed.data.customerEmail.trim() || null,
      note: parsed.data.note?.trim() || null,
    });

    const qrDataUrl = await qrToDataUrl(shortLink);

    // Lấy partner để verify tồn tại (không cần tính commission ở đây)
    const partner = await getPartner(partnerId);
    if (!partner) return { ok: false, error: "Không tìm thấy thông tin đối tác." };

    revalidatePath("/payment");
    revalidatePath("/dashboard");

    return {
      ok: true,
      result: {
        code,
        shortLink,
        qrDataUrl,
        orderAmount: parsed.data.amount,
        customerEmail: parsed.data.customerEmail?.trim() || null,
        note: parsed.data.note?.trim() || null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tạo link thất bại.";
    return { ok: false, error: message };
  }
}
