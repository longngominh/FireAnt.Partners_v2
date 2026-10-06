import { redirect } from "next/navigation";
import { getCouponByShortCode, type Coupon } from "@/lib/data/payment";
import { estimateUpgradeEndDate } from "@/lib/data/membership";
import { getOrCreatePartnerPaymentOrder, getOrderByCouponCode } from "@/lib/payment/order-payment";
import { parseUpgradeLink } from "@/lib/payment/upgrade-link";
import { parseVoucherPaymentLink, type VoucherLinkParams } from "@/lib/payment/voucher-link";
import { buildTransferContent } from "@/lib/payment/vietqr";
import { orderRef } from "@/lib/payment/order-ref";
import { PublicNotice } from "@/components/features/public/public-notice";
import {
  PurchasePaymentView,
  type PurchasePaymentViewModel,
} from "@/components/features/public/purchase-payment-view";
import {
  UpgradePaymentView,
  type UpgradePaymentViewModel,
} from "@/components/features/public/upgrade-payment-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Thanh toán FireAnt" };

const PAYMENT_BASE_URL =
  process.env.PAYMENT_BASE_URL ?? "https://company.fireant.vn/pay";

/** Danh sách domain hợp lệ cho trang thanh toán Corporate. */
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

function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}

export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const coupon = await getCouponByShortCode(code);

  if (!coupon) {
    return (
      <PublicNotice
        tone="error"
        title="Link không tồn tại hoặc đã bị thu hồi"
        detail="Vui lòng liên hệ người đã gửi link cho bạn để nhận link mới."
      />
    );
  }

  const upgrade = parseUpgradeLink(coupon.paymentLink);

  // ---- Coupon mua gói có mã khuyến mại: QR của đơn đã trừ mã (không qua checkout Corporate) ----
  const voucherLink = upgrade ? null : parseVoucherPaymentLink(coupon.paymentLink);
  if (voucherLink) {
    return <PurchasePaymentView view={await buildVoucherPurchaseView(coupon, voucherLink)} />;
  }

  // ---- Coupon mua gói thường: redirect sang checkout Corporate như trước ----
  if (!upgrade) {
    if (coupon.status === "EXPIRED") {
      return (
        <PublicNotice
          tone="warning"
          title="Link đã hết hạn"
          detail="Link thanh toán chỉ có hiệu lực 14 ngày. Vui lòng liên hệ người đã gửi link để nhận link mới."
        />
      );
    }

    const rawDestination =
      coupon.paymentLink ||
      (() => {
        const target = new URL(PAYMENT_BASE_URL);
        target.searchParams.set("coupon", coupon.code);
        return target.toString();
      })();

    redirect(normalisePaymentLink(rawDestination));
  }

  // ---- Coupon nâng cấp: hiển thị QR chuyển khoản định danh ----
  const order = await getOrderByCouponCode(coupon.code);
  const paid = order?.isPaid ?? false;
  const expired = !paid && isExpired(coupon.expiresAt);

  let accountNumber = "";
  let qrCodeUrl = "";
  let qrPending = false;
  let isMock = false;
  let qrRef: string | null = null;
  let unavailable = !order;

  if (order && !paid && !expired) {
    try {
      const qr = await getOrCreatePartnerPaymentOrder({
        couponCode: coupon.code,
        paymentLink: coupon.paymentLink,
        note: coupon.note,
        staff: "public-link",
      });
      accountNumber = qr.accountNumber;
      qrCodeUrl = qr.qrCodeUrl;
      qrPending = qr.qrPending;
      isMock = qr.isMock;
      qrRef = qr.orderRef;
    } catch (err) {
      console.error(`[p/${coupon.code}] không tạo được QR nâng cấp`, err);
      unavailable = true;
    }
  }

  let expectedEndDate: string | null = null;
  let currentServiceId: number | null = null;
  try {
    const est = await estimateUpgradeEndDate({
      userName: upgrade.userName,
      fromPackageId: upgrade.fromPackageId,
      packageId: upgrade.packageId,
      amount: upgrade.amount,
    });
    expectedEndDate = est.endDate?.toISOString() ?? null;
    currentServiceId = est.currentServiceId;
  } catch (err) {
    console.warn(`[p/${coupon.code}] không ước tính được hạn mới`, err);
  }

  // QR vừa dựng thì dùng đúng tham chiếu của tài khoản định danh; đơn đã trả / hết hạn thì dựng
  // lại từ mã dịch vụ của gói (lib/payment/order-ref.ts).
  const shownRef = qrRef ?? (order ? orderRef(order.serviceCode, order.orderId) : null);

  const view: UpgradePaymentViewModel = {
    code: coupon.code,
    state: paid ? "paid" : expired ? "expired" : unavailable ? "unavailable" : "pending",
    amount: order?.amount ?? upgrade.amount,
    orderId: order?.orderId ?? null,
    orderRef: shownRef,
    accountNumber,
    transferContent: shownRef ? buildTransferContent(shownRef) : "",
    qrCodeUrl,
    qrPending,
    isMock,
    userName: upgrade.userName,
    packageName: coupon.packageName,
    mode: upgrade.mode,
    expectedEndDate,
    paidEndDate: paid ? order?.endDate?.toISOString() ?? null : null,
    currentServiceId,
    expiresAt: coupon.expiresAt.toISOString(),
  };

  return <UpgradePaymentView view={view} />;
}

/**
 * Đơn của link có mã khuyến mại luôn được tạo cùng coupon (lib/payment/actions.ts) với giá đã
 * trừ mã; trang chỉ đọc lại đơn đó. Đơn đã bị huỷ (khách tự mua lại cùng gói trên fireant.vn,
 * quá hạn chuyển khoản…) thì lượt mã đã được trả lại — không phát QR nữa.
 */
async function buildVoucherPurchaseView(
  coupon: Coupon,
  link: VoucherLinkParams,
): Promise<PurchasePaymentViewModel> {
  const order = await getOrderByCouponCode(coupon.code);
  const paid = order?.isPaid ?? false;
  const expired = !paid && isExpired(coupon.expiresAt);
  const cancelled = !paid && (order?.isClosed ?? false);

  let accountNumber = "";
  let qrCodeUrl = "";
  let qrPending = false;
  let isMock = false;
  let qrRef: string | null = null;
  let unavailable = !order;

  if (order && !paid && !expired && !cancelled) {
    try {
      const qr = await getOrCreatePartnerPaymentOrder({
        couponCode: coupon.code,
        paymentLink: coupon.paymentLink,
        note: coupon.note,
        staff: "public-link",
      });
      accountNumber = qr.accountNumber;
      qrCodeUrl = qr.qrCodeUrl;
      qrPending = qr.qrPending;
      isMock = qr.isMock;
      qrRef = qr.orderRef;
    } catch (err) {
      console.error(`[p/${coupon.code}] không tạo được QR cho link có mã khuyến mại`, err);
      unavailable = true;
    }
  }

  const shownRef = qrRef ?? (order ? orderRef(order.serviceCode, order.orderId) : null);

  return {
    code: coupon.code,
    state: paid ? "paid" : expired ? "expired" : cancelled ? "cancelled" : unavailable ? "unavailable" : "pending",
    amount: order?.amount ?? coupon.orderAmount,
    listAmount: order?.listAmount ?? null,
    voucherCode: link.voucherCode,
    discountAmount: order?.voucherDiscount ?? coupon.discountAmount,
    orderId: order?.orderId ?? null,
    orderRef: shownRef,
    accountNumber,
    transferContent: shownRef ? buildTransferContent(shownRef) : "",
    qrCodeUrl,
    qrPending,
    isMock,
    userName: link.userName,
    packageName: coupon.packageName,
    paidEndDate: paid ? order?.endDate?.toISOString() ?? null : null,
    expiresAt: coupon.expiresAt.toISOString(),
  };
}
