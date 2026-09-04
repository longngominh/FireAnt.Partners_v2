import { redirect } from "next/navigation";
import { getCouponByShortCode } from "@/lib/data/payment";
import { estimateUpgradeEndDate } from "@/lib/data/membership";
import { getOrCreatePartnerPaymentOrder, getOrderByCouponCode } from "@/lib/payment/order-payment";
import { parseUpgradeLink } from "@/lib/payment/upgrade-link";
import { buildTransferContent } from "@/lib/payment/vietqr";
import { PublicNotice } from "@/components/features/public/public-notice";
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

  const view: UpgradePaymentViewModel = {
    code: coupon.code,
    state: paid ? "paid" : expired ? "expired" : unavailable ? "unavailable" : "pending",
    amount: order?.amount ?? upgrade.amount,
    orderId: order?.orderId ?? null,
    accountNumber,
    transferContent: order ? buildTransferContent(order.orderId) : "",
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
