"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createPaymentSchema } from "@/lib/validations/payment";
import { createCoupon } from "@/lib/data/payment";
import { generateShortCode, buildShortLink } from "@/lib/utils/shortcode";
import { qrToDataUrl } from "@/lib/utils/qr";
import { getPartner } from "@/lib/data/partners";
import { createPartnerPaymentOrder } from "@/lib/payment/order-payment";

import type { CreatePaymentState } from "@/lib/payment/types";

export async function createPaymentAction(
  _prev: CreatePaymentState,
  formData: FormData,
): Promise<CreatePaymentState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

  const isAdmin = session.user.role === "admin";
  const requestedPartnerId = formData.get("partnerId");
  const partnerId =
    isAdmin && typeof requestedPartnerId === "string" && requestedPartnerId.trim()
      ? requestedPartnerId.trim()
      : session.user.partnerId;

  if (!partnerId) {
    return {
      ok: false,
      error: "Vui lòng chọn đối tác để tạo link.",
      fieldErrors: { partnerId: ["Vui lòng chọn đối tác"] },
    };
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
    const partner = await getPartner(partnerId);
    if (!partner || !partner.isActive) {
      return {
        ok: false,
        error: "Không tìm thấy đối tác đang hoạt động.",
        fieldErrors: { partnerId: ["Đối tác không hợp lệ"] },
      };
    }

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
    const paymentLink = paymentUrl.toString();

    const paymentOrder = await createPartnerPaymentOrder({
      packageId: parsed.data.packageId,
      userName: parsed.data.customerEmail.trim(),
      amount: parsed.data.amount,
      couponCode: code,
      note: parsed.data.note?.trim() || null,
      staff: session.user.email?.trim() || session.user.id || "partner",
    });

    await createCoupon({
      partnerId,
      code,
      paymentLink,
      packageId: parsed.data.packageId,
      userName: parsed.data.customerEmail.trim() || null,
      note: parsed.data.note?.trim() || null,
    });

    revalidatePath("/payment");
    revalidatePath("/dashboard");
    revalidatePath("/admin");
    revalidatePath("/admin/partners");

    return {
      ok: true,
      result: {
        code,
        shortLink,
        paymentLink,
        qrCodeUrl: paymentOrder.qrCodeUrl || await qrToDataUrl(paymentLink),
        orderId: paymentOrder.orderId,
        accountNumber: paymentOrder.accountNumber,
        qrPending: paymentOrder.qrPending,
        isMock: paymentOrder.isMock,
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
