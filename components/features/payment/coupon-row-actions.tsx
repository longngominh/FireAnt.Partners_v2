"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CopyIcon, EyeIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatVND } from "@/lib/utils/currency";
import { qrToDataUrl } from "@/lib/utils/qr";
import { StatusBadge } from "./status-badge";
import type { Coupon } from "@/lib/data/payment";

type PaymentQrResult = {
  orderId: number;
  qrCodeUrl: string;
  accountNumber: string;
  qrPending: boolean;
  isMock: boolean;
  fallbackToCheckout?: boolean;
};

class PaymentQrFatalError extends Error {}

export function CouponRowActions({
  coupon,
  paymentLink,
}: {
  coupon: Coupon;
  paymentLink: string;
}) {
  const [open, setOpen] = useState(false);
  const [paymentQr, setPaymentQr] = useState<PaymentQrResult | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(paymentLink);
    toast.success("Đã copy link thanh toán", { description: paymentLink });
  }

  async function copyCode() {
    await navigator.clipboard.writeText(coupon.code);
    toast.success("Đã copy mã", { description: coupon.code });
  }

  async function ensureQr() {
    if (paymentQr?.qrCodeUrl) return paymentQr.qrCodeUrl;

    setIsGeneratingQr(true);
    try {
      try {
        const response = await fetch(`/api/coupons/${encodeURIComponent(coupon.code)}/payment-qr`);
        const payload = await response.json();
        if (!response.ok) {
          if (payload.code === "ORDER_PAID") {
            throw new PaymentQrFatalError(payload.error ?? "Đơn hàng đã thanh toán");
          }

          throw new Error(payload.error ?? "Không tạo được mã QR chuyển khoản");
        }

        if (payload.qrCodeUrl) {
          setPaymentQr(payload);
          return payload.qrCodeUrl as string;
        }

        const fallbackQrCodeUrl = await qrToDataUrl(paymentLink);
        setPaymentQr({
          ...payload,
          qrCodeUrl: fallbackQrCodeUrl,
          fallbackToCheckout: true,
        });
        return fallbackQrCodeUrl;
      } catch (err) {
        if (err instanceof PaymentQrFatalError) throw err;

        console.warn("[payment-qr] fallback to checkout QR", err);
        const fallbackQrCodeUrl = await qrToDataUrl(paymentLink);
        setPaymentQr({
          orderId: 0,
          qrCodeUrl: fallbackQrCodeUrl,
          accountNumber: "",
          qrPending: false,
          isMock: false,
          fallbackToCheckout: true,
        });
        return fallbackQrCodeUrl;
      }
    } finally {
      setIsGeneratingQr(false);
    }
  }

  async function openPreview() {
    setOpen(true);
    try {
      await ensureQr();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tạo được mã QR");
    }
  }

  async function downloadQR() {
    let href: string;
    try {
      href = await ensureQr();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tạo được mã QR");
      return;
    }
    if (!href) {
      toast.warning("QR thanh toán chưa sẵn sàng");
      return;
    }

    const a = document.createElement("a");
    a.href = href;
    a.download = `qr-${coupon.code}.png`;
    a.click();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={copyLink}
          title="Copy link"
        >
          <CopyIcon className="size-3.5" />
          <span className="sr-only">Copy link</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={openPreview}
          title="Xem QR và chi tiết"
        >
          <EyeIcon className="size-3.5" />
          <span className="sr-only">Preview</span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <code className="font-mono text-sm">{coupon.code}</code>
              <StatusBadge status={coupon.status} />
            </DialogTitle>
            <DialogDescription>
              {coupon.customerName ?? "Chưa sử dụng"}
              {coupon.packageName ? ` · ${coupon.packageName}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-w-0 flex-col items-center gap-3 rounded-lg border bg-muted/30 p-3 sm:p-4">
            <div className="rounded-md bg-background p-2 shadow-sm">
              {paymentQr?.qrCodeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={paymentQr.qrCodeUrl}
                  alt="QR thanh toán"
                  className="size-40 sm:size-44"
                />
              ) : (
                <div className="flex size-40 items-center justify-center text-xs text-muted-foreground sm:size-44">
                  {isGeneratingQr ? "Đang tạo QR..." : "Chưa có QR"}
                </div>
              )}
            </div>
            {paymentQr?.orderId && paymentQr.orderId > 0 ? (
              <code className="rounded bg-muted px-2 py-1 text-xs">FA{paymentQr.orderId}</code>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-lg border bg-card p-3 text-center text-xs sm:grid-cols-2">
            <Stat label="Gói" value={coupon.packageName ?? "—"} mono={false} />
            <Stat
              label="Số tiền"
              value={coupon.orderAmount > 0 ? formatVND(coupon.orderAmount) : "—"}
              accent="info"
            />
            {paymentQr?.accountNumber ? (
              <Stat label="Tài khoản nhận" value={paymentQr.accountNumber} />
            ) : null}
          </div>
          {paymentQr?.qrPending ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
              OnePay tạm chưa trả QR chuyển khoản. QR hiện tại sẽ mở trang thanh toán để khách lấy QR tại checkout.
            </div>
          ) : null}
          {paymentQr?.fallbackToCheckout && !paymentQr.qrPending ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
              Đang dùng QR mở trang thanh toán vì chưa lấy được QR chuyển khoản trực tiếp.
            </div>
          ) : null}
          {paymentQr?.isMock ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
              OnePay đang ở mock mode. Cần cấu hình ONEPAY_MODE=real để dùng QR thật.
            </div>
          ) : null}

          <DialogFooter className="sm:space-x-2">
            <Button variant="outline" onClick={copyCode} className="w-full gap-2 sm:flex-1">
              <CopyIcon className="size-4" /> Copy mã
            </Button>
            <Button
              variant="outline"
              onClick={downloadQR}
              disabled={isGeneratingQr}
              className="w-full gap-2 sm:flex-1"
            >
              <DownloadIcon className="size-4" /> QR
            </Button>
            <Button onClick={copyLink} className="w-full gap-2 sm:flex-1">
              <CopyIcon className="size-4" /> Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
  mono = true,
}: {
  label: string;
  value: string;
  accent?: "success" | "info";
  mono?: boolean;
}) {
  const color =
    accent === "success"
      ? "text-success"
      : accent === "info"
      ? "text-info"
      : "text-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`num text-xs font-semibold ${mono ? "font-mono" : ""} ${color}`}>{value}</span>
    </div>
  );
}
