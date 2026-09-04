"use client";

import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ArrowRightIcon, CopyIcon, DownloadIcon, LinkIcon, QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatVND } from "@/lib/utils/currency";
import { RECEIVING_BANK } from "@/lib/payment/tiers";
import type { CreatePaymentResult } from "@/lib/payment/types";
import { TierBadge, copyText, downloadImage } from "./form-bits";

export function PaymentResultDialog({
  result,
  open,
  onOpenChange,
}: {
  result: CreatePaymentResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isUpgrade = result?.kind === "upgrade";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Bố cục ngang (QR trái, thông tin phải) + dialog rộng để nội dung nằm gọn
          trong khung hình, không phải cuộn. Chỉ cuộn khi màn hình thật sự thấp. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {result ? (
          <>
            <DialogHeader className="px-6 pt-5 pb-3">
              <DialogTitle className="flex items-center gap-2">
                {isUpgrade ? <QrCodeIcon className="size-4 text-primary" /> : <LinkIcon className="size-4 text-primary" />}
                {isUpgrade ? "Link nâng cấp đã sẵn sàng" : "Link thanh toán đã sẵn sàng"}
              </DialogTitle>
              <DialogDescription>
                {isUpgrade
                  ? "Gửi link hoặc QR cho khách. Khách chuyển đúng số tiền — gói được nâng cấp tự động ngay khi nhận tiền."
                  : "Chia sẻ QR chuyển khoản hoặc link thanh toán cho khách hàng."}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto px-6 pb-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
                {/* QR */}
                <div className="flex flex-col items-center gap-2 sm:w-44">
                  <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
                    {result.qrCodeUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.qrCodeUrl} alt="QR thanh toán" className="size-40" />
                    ) : (
                      <div className="flex size-40 items-center justify-center text-center text-xs text-neutral-500">
                        QR thanh toán chưa sẵn sàng
                      </div>
                    )}
                  </div>
                  {result.orderId ? (
                    <code className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">FA{result.orderId}</code>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!result.qrCodeUrl}
                    className="mt-1 w-full gap-1.5"
                    onClick={() => downloadImage(result.qrCodeUrl, `qr-${result.code}.jpg`)}
                  >
                    <DownloadIcon className="size-3.5" /> Tải QR
                  </Button>
                </div>

                {/* Details */}
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {isUpgrade ? "Khách cần chuyển" : "Giá gói"}
                      </span>
                      <span className="num text-2xl font-bold tracking-tight text-primary">
                        {formatVND(result.orderAmount)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <div className="flex items-center gap-1.5">
                        {isUpgrade && result.fromServiceId ? (
                          <>
                            <TierBadge serviceId={result.fromServiceId} />
                            <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                          </>
                        ) : null}
                        {result.serviceId ? <TierBadge serviceId={result.serviceId} /> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">{result.modeLabel ?? result.packageLabel}</span>
                    </div>
                  </div>

                  <dl className="flex min-w-0 flex-col divide-y text-xs">
                    <Row label="Mã coupon">
                      <span className="flex items-center justify-end gap-1">
                        <code className="font-mono font-semibold">{result.code}</code>
                        <MiniCopy value={result.code} message="Đã copy mã coupon" />
                      </span>
                    </Row>
                    <Row label="Tài khoản FireAnt">
                      <span className="truncate font-medium">{result.customerEmail ?? "—"}</span>
                    </Row>
                    {result.accountNumber ? (
                      <Row label="Tài khoản nhận">
                        <span className="flex items-center justify-end gap-1">
                          <span className="num font-mono font-semibold">{result.accountNumber}</span>
                          <span className="text-[11px] text-muted-foreground">
                            · {RECEIVING_BANK.shortName}
                          </span>
                          <MiniCopy value={result.accountNumber} message="Đã copy số tài khoản" />
                        </span>
                      </Row>
                    ) : null}
                    {result.transferContent ? (
                      <Row label="Nội dung CK">
                        <span className="flex items-center justify-end gap-1">
                          <span className="font-medium">{result.transferContent}</span>
                          <MiniCopy value={result.transferContent} message="Đã copy nội dung chuyển khoản" />
                        </span>
                      </Row>
                    ) : null}
                    {isUpgrade && result.expectedEndDate ? (
                      <Row label="Hạn mới dự kiến">
                        <span className="num font-semibold">
                          {format(new Date(result.expectedEndDate), "dd/MM/yyyy", { locale: vi })}
                        </span>
                      </Row>
                    ) : null}
                    {result.note ? (
                      <Row label="Ghi chú">
                        <span className="font-medium">{result.note}</span>
                      </Row>
                    ) : null}
                  </dl>

                  {result.qrPending ? (
                    <Notice>OnePay tạm chưa trả QR chuyển khoản. Khách vẫn có thể mở link — QR sẽ được tạo lại khi truy cập.</Notice>
                  ) : null}
                  {result.isMock ? (
                    <Notice>OnePay đang ở mock mode. Cần cấu hình ONEPAY_MODE=real để dùng QR thật.</Notice>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Footer: link gửi khách + hành động chính */}
            <div className="flex flex-col gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:items-center">
              <input
                readOnly
                value={result.publicLink}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link gửi khách"
                className="h-9 min-w-0 flex-1 truncate rounded-lg border bg-background px-3 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button
                type="button"
                className="h-9 shrink-0 gap-2"
                onClick={() => copyText(result.publicLink, "Đã copy link gửi khách")}
              >
                <CopyIcon className="size-4" /> Copy link
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}

function MiniCopy({ value, message }: { value: string; message: string }) {
  return (
    <button
      type="button"
      onClick={() => copyText(value, message)}
      title="Copy"
      aria-label="Copy"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <CopyIcon className="size-3" />
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
      {children}
    </div>
  );
}
