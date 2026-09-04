"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import { createPaymentSchema, createUpgradePaymentSchema } from "@/lib/validations/payment";
import { createCoupon } from "@/lib/data/payment";
import { generateShortCode, buildShortLink } from "@/lib/utils/shortcode";
import { qrToDataUrl } from "@/lib/utils/qr";
import { getPartner } from "@/lib/data/partners";
import { findFireAntUser } from "@/lib/data/identity";
import { getUpgradeQuote, type UpgradeQuote } from "@/lib/data/membership";
import {
  createPartnerPaymentOrder,
  createPartnerUpgradeOrder,
  getPackageInfo,
} from "@/lib/payment/order-payment";
import { buildUpgradePaymentLink } from "@/lib/payment/upgrade-link";
import { durationLabel, tierName } from "@/lib/payment/tiers";

import type { CreatePaymentState } from "@/lib/payment/types";


function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function staffOf(session: Session): string {
  return session.user.email?.trim() || session.user.id || "partner";
}

/**
 * Admin có thể tạo link thay cho một đối tác (field partnerId); đối tác thường
 * luôn dùng partnerId trong phiên đăng nhập.
 */
async function resolvePartner(
  session: Session,
  formData: FormData,
): Promise<{ partnerId: string } | { error: CreatePaymentState }> {
  const isAdmin = session.user.role === "admin";
  const requestedPartnerId = formData.get("partnerId");
  const partnerId =
    isAdmin && typeof requestedPartnerId === "string" && requestedPartnerId.trim()
      ? requestedPartnerId.trim()
      : session.user.partnerId;

  if (!partnerId) {
    return {
      error: {
        ok: false,
        error: "Vui lòng chọn đối tác để tạo link.",
        fieldErrors: { partnerId: ["Vui lòng chọn đối tác"] },
      },
    };
  }

  const partner = await getPartner(partnerId);
  if (!partner || !partner.isActive) {
    return {
      error: {
        ok: false,
        error: "Không tìm thấy đối tác đang hoạt động.",
        fieldErrors: { partnerId: ["Đối tác không hợp lệ"] },
      },
    };
  }

  return { partnerId };
}

function revalidateAfterCreate() {
  revalidatePath("/payment");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath("/admin/partners");
}

export async function createPaymentAction(
  _prev: CreatePaymentState,
  formData: FormData,
): Promise<CreatePaymentState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

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
    const resolved = await resolvePartner(session, formData);
    if ("error" in resolved) return resolved.error;
    const { partnerId } = resolved;

    // Giá lấy từ DB, không tin số tiền client gửi lên.
    const pkg = await getPackageInfo(parsed.data.packageId);
    const amount = Math.round(pkg.amount);

    // Không bắt buộc tài khoản FireAnt tồn tại — khách có thể mua trước,
    // tạo tài khoản sau. Nếu đã tồn tại thì dùng UserName chuẩn trong DB
    // (đúng hoa/thường); nếu chưa thì giữ nguyên giá trị đối tác nhập.
    let customerUserName = parsed.data.customerEmail.trim();
    try {
      const fireantUser = await findFireAntUser(customerUserName);
      if (fireantUser) customerUserName = fireantUser.userName;
    } catch (err) {
      console.warn("[createPaymentAction] tra cứu tài khoản FireAnt lỗi, bỏ qua", err);
    }

    const code = generateShortCode(8);
    const shortLink = buildShortLink(appBaseUrl(), code);

    // URL thanh toán thực tế với packageId, couponCode và userName
    const paymentBaseUrl = process.env.PAYMENT_BASE_URL ?? "https://fireant.vn/checkout";
    const paymentUrl = new URL(paymentBaseUrl);
    paymentUrl.searchParams.set("packageId", String(parsed.data.packageId));
    paymentUrl.searchParams.set("paymentMethod", "1");
    paymentUrl.searchParams.set("couponCode", code);
    paymentUrl.searchParams.set("userName", customerUserName);
    const paymentLink = paymentUrl.toString();

    const note = parsed.data.note?.trim() || null;

    const paymentOrder = await createPartnerPaymentOrder({
      packageId: parsed.data.packageId,
      userName: customerUserName,
      amount,
      couponCode: code,
      note,
      staff: staffOf(session),
    });

    await createCoupon({
      partnerId,
      code,
      paymentLink,
      packageId: parsed.data.packageId,
      userName: customerUserName,
      note,
    });

    revalidateAfterCreate();

    const isCourse = pkg.serviceId === 39;
    const packageLabel = isCourse
      ? pkg.packageName ?? `Khóa học #${pkg.packageId}`
      : `${tierName(pkg.serviceId ?? 33)} · ${durationLabel(pkg.months)}`;

    return {
      ok: true,
      result: {
        kind: "purchase",
        code,
        shortLink,
        paymentLink,
        publicLink: paymentLink,
        qrCodeUrl: paymentOrder.qrCodeUrl || (await qrToDataUrl(paymentLink)),
        orderId: paymentOrder.orderId,
        accountNumber: paymentOrder.accountNumber,
        transferContent: paymentOrder.transferContent,
        qrPending: paymentOrder.qrPending,
        isMock: paymentOrder.isMock,
        orderAmount: amount,
        customerEmail: customerUserName,
        note,
        serviceId: pkg.serviceId,
        packageLabel,
        modeLabel: null,
        expectedEndDate: null,
        fromServiceId: null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tạo link thất bại.";
    return { ok: false, error: message };
  }
}

/** Tra cứu điều kiện + báo giá nâng cấp cho một tài khoản FireAnt. */
export async function getUpgradeQuoteAction(customerEmail: string): Promise<UpgradeQuote> {
  const session = await auth();
  if (!session?.user) {
    return { eligible: false, title: "Phiên đăng nhập đã hết hạn", detail: "Vui lòng tải lại trang và đăng nhập lại." };
  }

  try {
    return await getUpgradeQuote(customerEmail);
  } catch (err) {
    console.error("[getUpgradeQuoteAction]", err);
    return {
      eligible: false,
      title: "Chưa thể tải thông tin nâng cấp",
      detail: "Đã có lỗi khi tra cứu dữ liệu. Vui lòng thử lại sau.",
    };
  }
}

export async function createUpgradePaymentAction(
  _prev: CreatePaymentState,
  formData: FormData,
): Promise<CreatePaymentState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };

  const parsed = createUpgradePaymentSchema.safeParse({
    customerEmail: formData.get("customerEmail") ?? "",
    tierServiceId: formData.get("tierServiceId"),
    option: formData.get("option") ?? "",
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
    const resolved = await resolvePartner(session, formData);
    if ("error" in resolved) return resolved.error;
    const { partnerId } = resolved;

    // Luôn tính lại báo giá trên server — số tiền trên QR không lấy từ client.
    const quote = await getUpgradeQuote(parsed.data.customerEmail);
    if (!quote.eligible) {
      return { ok: false, error: `${quote.title}. ${quote.detail}` };
    }

    const tier = quote.tiers.find((t) => t.serviceId === parsed.data.tierServiceId);
    if (!tier) {
      return { ok: false, error: "Hạng nâng cấp không còn khả dụng cho khách này.", fieldErrors: { option: ["Chọn lại phương án"] } };
    }
    const option = tier.options.find((o) => o.key === parsed.data.option);
    if (!option || !option.available || option.price <= 0) {
      return {
        ok: false,
        error: "Phương án nâng cấp đã thay đổi, vui lòng kiểm tra lại tài khoản và chọn lại.",
        fieldErrors: { option: ["Chọn lại phương án"] },
      };
    }

    const modeLabel =
      option.kind === "keep"
        ? `Giữ nguyên hạn, chuyển sang ${tier.name}`
        : `Gói ${durationLabel(option.months)} ${tier.name} từ hôm nay`;

    const code = generateShortCode(8);
    const baseUrl = appBaseUrl();
    const shortLink = buildShortLink(baseUrl, code);
    const paymentLink = buildUpgradePaymentLink(baseUrl, code, {
      packageId: option.packageId,
      fromPackageId: quote.current.packageId,
      amount: option.price,
      userName: quote.userName,
      mode: option.kind,
    });

    const note = parsed.data.note?.trim() || null;

    const paymentOrder = await createPartnerUpgradeOrder({
      newPackageId: option.packageId,
      oldPackageId: quote.current.packageId,
      userName: quote.userName,
      amount: option.price,
      couponCode: code,
      modeLabel: option.kind === "keep" ? "giu nguyen han" : `goi ${option.months} thang`,
      note,
      staff: staffOf(session),
    });

    await createCoupon({
      partnerId,
      code,
      paymentLink,
      packageId: option.packageId,
      userName: quote.userName,
      note,
    });

    revalidateAfterCreate();

    return {
      ok: true,
      result: {
        kind: "upgrade",
        code,
        shortLink,
        paymentLink,
        publicLink: shortLink,
        qrCodeUrl: paymentOrder.qrCodeUrl || (await qrToDataUrl(shortLink)),
        orderId: paymentOrder.orderId,
        accountNumber: paymentOrder.accountNumber,
        transferContent: paymentOrder.transferContent,
        qrPending: paymentOrder.qrPending,
        isMock: paymentOrder.isMock,
        orderAmount: option.price,
        customerEmail: quote.userName,
        note,
        serviceId: tier.serviceId,
        packageLabel: `${tier.name} · ${durationLabel(option.months)}`,
        modeLabel,
        expectedEndDate: option.endDate,
        fromServiceId: quote.current.serviceId,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tạo link nâng cấp thất bại.";
    return { ok: false, error: message };
  }
}
