"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import {
  createPaymentExtrasSchema,
  createPaymentSchema,
  createUpgradePaymentSchema,
  sourceSchema,
  voucherCodeSchema,
} from "@/lib/validations/payment";
import { createCoupon } from "@/lib/data/payment";
import { generateShortCode, buildShortLink } from "@/lib/utils/shortcode";
import { qrToDataUrl } from "@/lib/utils/qr";
import { getPartner } from "@/lib/data/partners";
import { CustomerUserNameError, resolveCustomerUserName } from "@/lib/payment/customer";
import { getUpgradeQuote, type UpgradeQuote } from "@/lib/data/membership";
import {
  VOUCHER_FULL_DISCOUNT_MESSAGE,
  VoucherApplyError,
  cancelPartnerOrderQuietly,
  createPartnerPaymentOrder,
  createPartnerUpgradeOrder,
  getPackageInfo,
} from "@/lib/payment/order-payment";
import { buildUpgradePaymentLink } from "@/lib/payment/upgrade-link";
import { buildVoucherPaymentLink, normalizeVoucherCode } from "@/lib/payment/voucher-link";
import { previewVoucher } from "@/lib/payment/voucher";
import { durationLabel, tierName } from "@/lib/payment/tiers";

import type { AppliedVoucher, CreatePaymentState, VoucherPreview } from "@/lib/payment/types";

/** service_ApplyVoucher bắt buộc AspNetUsers.Id — khách chỉ có email thì chưa dùng mã được. */
const VOUCHER_NEEDS_ACCOUNT =
  "Mã khuyến mại chỉ dùng được khi khách đã có tài khoản FireAnt. Nhờ khách đăng ký trước, hoặc bỏ mã để tạo link giá gốc.";


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
  const extras = createPaymentExtrasSchema.safeParse({
    voucherCode: formData.get("voucherCode") ?? "",
    source: formData.get("source") ?? "",
  });

  if (!parsed.success || !extras.success) {
    return {
      ok: false,
      error: "Dữ liệu không hợp lệ.",
      fieldErrors: {
        ...(parsed.success ? {} : parsed.error.flatten().fieldErrors),
        ...(extras.success ? {} : extras.error.flatten().fieldErrors),
      },
    };
  }

  try {
    const resolved = await resolvePartner(session, formData);
    if ("error" in resolved) return resolved.error;
    const { partnerId } = resolved;
    const { voucherCode, source } = extras.data;

    // Giá lấy từ DB, không tin số tiền client gửi lên.
    const pkg = await getPackageInfo(parsed.data.packageId);
    const amount = Math.round(pkg.amount);

    // Không bắt buộc tài khoản FireAnt tồn tại — khách có thể mua trước, tạo tài khoản sau.
    // resolveCustomerUserName lo phần chuẩn hoá: có tài khoản thì lấy UserName chuẩn trong DB,
    // chưa có thì bắt buộc là email và hạ về chữ thường (xem lib/payment/customer.ts).
    let customerUserName: string;
    let customerHasAccount: boolean;
    let customerUserId: string | null;
    try {
      const resolvedCustomer = await resolveCustomerUserName(parsed.data.customerEmail);
      customerUserName = resolvedCustomer.userName;
      customerHasAccount = resolvedCustomer.hasAccount;
      customerUserId = resolvedCustomer.userId;
    } catch (err) {
      if (err instanceof CustomerUserNameError) {
        return {
          ok: false,
          error: err.message,
          fieldErrors: { customerEmail: [err.message] },
        };
      }
      throw err;
    }

    // Mã khuyến mại: kiểm tra lại trên server (không tin kết quả "Áp dụng" ở client) TRƯỚC
    // khi tạo đơn, để mã sai không sinh đơn rác. Lượt dùng chỉ bị tính khi áp vào đơn.
    let voucher: { code: string; userId: string; title: string } | null = null;
    if (voucherCode) {
      const failed = (message: string): CreatePaymentState => ({
        ok: false,
        error: message,
        fieldErrors: { voucherCode: [message] },
      });
      if (!customerUserId) return failed(VOUCHER_NEEDS_ACCOUNT);

      const check = await previewVoucher({
        code: voucherCode,
        packageId: parsed.data.packageId,
        userId: customerUserId,
        orderAmount: amount,
      });
      if (!check.ok) return failed(check.message);
      if (amount - check.discountAmount <= 0) return failed(VOUCHER_FULL_DISCOUNT_MESSAGE);

      voucher = { code: voucherCode, userId: customerUserId, title: check.title };
    }

    const code = generateShortCode(8);
    const baseUrl = appBaseUrl();
    const shortLink = buildShortLink(baseUrl, code);

    // Có mã khuyến mại thì link về trang QR của Partners, KHÔNG sang checkout Corporate:
    // /pay có couponCode huỷ đơn đã giảm giá và tạo đơn giá gốc (lib/payment/voucher-link.ts).
    const paymentLink = voucher
      ? buildVoucherPaymentLink(baseUrl, code, {
          packageId: parsed.data.packageId,
          userName: customerUserName,
          voucherCode: voucher.code,
        })
      : buildCheckoutLink(code, parsed.data.packageId, customerUserName);
    const publicLink = voucher ? shortLink : paymentLink;

    const note = parsed.data.note?.trim() || null;

    let paymentOrder: Awaited<ReturnType<typeof createPartnerPaymentOrder>>;
    try {
      paymentOrder = await createPartnerPaymentOrder({
        packageId: parsed.data.packageId,
        userName: customerUserName,
        amount,
        couponCode: code,
        note,
        staff: staffOf(session),
        voucher: voucher ? { code: voucher.code, userId: voucher.userId } : null,
      });
    } catch (err) {
      if (err instanceof VoucherApplyError) {
        return { ok: false, error: err.message, fieldErrors: { voucherCode: [err.message] } };
      }
      throw err;
    }

    try {
      await createCoupon({
        partnerId,
        code,
        paymentLink,
        packageId: parsed.data.packageId,
        userName: customerUserName,
        note,
        source,
        voucherCode: voucher?.code ?? null,
        discountAmount: paymentOrder.voucher?.discountAmount ?? null,
      });
    } catch (err) {
      // Đơn đã giữ một lượt của mã mà không có coupon thì không ai gửi được link — trả lượt lại.
      if (voucher) await cancelPartnerOrderQuietly(paymentOrder.orderId, `Khong tao duoc coupon ${code}`);
      throw err;
    }

    revalidateAfterCreate();

    const isCourse = pkg.serviceId === 39;
    const packageLabel = isCourse
      ? pkg.packageName ?? `Khóa học #${pkg.packageId}`
      : `${tierName(pkg.serviceId ?? 33)} · ${durationLabel(pkg.months)}`;

    const appliedVoucher: AppliedVoucher | null =
      voucher && paymentOrder.voucher
        ? {
            code: voucher.code,
            title: voucher.title,
            discountAmount: paymentOrder.voucher.discountAmount,
            benefit: paymentOrder.voucher.benefit,
          }
        : null;

    return {
      ok: true,
      result: {
        kind: "purchase",
        code,
        shortLink,
        paymentLink,
        publicLink,
        qrCodeUrl: paymentOrder.qrCodeUrl || (await qrToDataUrl(publicLink)),
        orderId: paymentOrder.orderId,
        accountNumber: paymentOrder.accountNumber,
        transferContent: paymentOrder.transferContent,
        qrPending: paymentOrder.qrPending,
        isMock: paymentOrder.isMock,
        orderAmount: paymentOrder.amount,
        customerEmail: customerUserName,
        customerHasAccount,
        note,
        serviceId: pkg.serviceId,
        packageLabel,
        modeLabel: null,
        expectedEndDate: null,
        fromServiceId: null,
        listAmount: amount,
        voucher: appliedVoucher,
        source,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tạo link thất bại.";
    return { ok: false, error: message };
  }
}

/** Link checkout Corporate cho coupon mua gói KHÔNG có mã khuyến mại (như trước). */
function buildCheckoutLink(code: string, packageId: number, userName: string): string {
  const paymentBaseUrl = process.env.PAYMENT_BASE_URL ?? "https://fireant.vn/checkout";
  const paymentUrl = new URL(paymentBaseUrl);
  paymentUrl.searchParams.set("packageId", String(packageId));
  paymentUrl.searchParams.set("paymentMethod", "1");
  paymentUrl.searchParams.set("couponCode", code);
  paymentUrl.searchParams.set("userName", userName);
  return paymentUrl.toString();
}

/** Kiểm tra mã khuyến mại cho gói + khách đang nhập ở /payment/create — không ghi gì. */
export async function previewVoucherAction(input: {
  code: string;
  packageId: number;
  customer: string;
}): Promise<VoucherPreview> {
  const rawCode = String(input.code ?? "");
  const packageId = Number(input.packageId);
  const customer = String(input.customer ?? "").trim();
  const base = { code: normalizeVoucherCode(rawCode), packageId, customer };
  const failed = (error: string, field: "voucherCode" | "customerEmail" = "voucherCode"): VoucherPreview => ({
    ok: false,
    ...base,
    error,
    field,
  });

  const session = await auth();
  if (!session?.user) return failed("Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.");

  const parsedCode = voucherCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) return failed(parsedCode.error.issues[0]?.message ?? "Mã khuyến mại không hợp lệ.");
  if (!parsedCode.data) return failed("Nhập mã khuyến mại.");
  if (!Number.isInteger(packageId) || packageId <= 0) return failed("Chọn gói dịch vụ trước khi áp mã.");
  if (!customer) return failed("Nhập tài khoản FireAnt của khách trước khi áp mã.", "customerEmail");

  try {
    const pkg = await getPackageInfo(packageId);
    const listAmount = Math.round(pkg.amount);

    let userId: string | null;
    try {
      userId = (await resolveCustomerUserName(customer)).userId;
    } catch (err) {
      if (err instanceof CustomerUserNameError) return failed(err.message, "customerEmail");
      throw err;
    }
    if (!userId) return failed(VOUCHER_NEEDS_ACCOUNT);

    const check = await previewVoucher({ code: parsedCode.data, packageId, userId, orderAmount: listAmount });
    if (!check.ok) return failed(check.message);

    const finalAmount = listAmount - check.discountAmount;
    if (finalAmount <= 0) return failed(VOUCHER_FULL_DISCOUNT_MESSAGE);

    return {
      ok: true,
      ...base,
      title: check.title,
      discountAmount: check.discountAmount,
      benefit: check.benefit,
      listAmount,
      finalAmount,
      expiresAt: check.expiresAt?.toISOString() ?? null,
      remainingUses: check.remainingUses,
    };
  } catch (err) {
    console.error("[previewVoucherAction]", err);
    return failed("Chưa kiểm tra được mã khuyến mại, vui lòng thử lại.");
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
  // Nâng cấp không nhận mã khuyến mại: service_ProcessUpgradeOrder chỉ làm việc với
  // UpgradeAmount và số tiền đó còn quy đổi thành ngày sử dụng — chỉ gắn nguồn khách.
  const parsedSource = sourceSchema.safeParse(formData.get("source") ?? "");

  if (!parsed.success || !parsedSource.success) {
    return {
      ok: false,
      error: "Dữ liệu không hợp lệ.",
      fieldErrors: {
        ...(parsed.success ? {} : parsed.error.flatten().fieldErrors),
        ...(parsedSource.success ? {} : { source: parsedSource.error.issues.map((i) => i.message) }),
      },
    };
  }

  try {
    const resolved = await resolvePartner(session, formData);
    if ("error" in resolved) return resolved.error;
    const { partnerId } = resolved;
    const source = parsedSource.data;

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
      source,
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
        // Nâng cấp chỉ áp dụng cho khách đang dùng gói -> luôn đã có tài khoản.
        customerHasAccount: true,
        note,
        serviceId: tier.serviceId,
        packageLabel: `${tier.name} · ${durationLabel(option.months)}`,
        modeLabel,
        expectedEndDate: option.endDate,
        fromServiceId: quote.current.serviceId,
        listAmount: null,
        voucher: null,
        source,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tạo link nâng cấp thất bại.";
    return { ok: false, error: message };
  }
}
