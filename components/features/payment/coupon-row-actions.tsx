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
import { StatusBadge } from "./status-badge";
import type { Coupon } from "@/lib/data/payment";

export function CouponRowActions({
  coupon,
  shortLink,
  qrDataUrl,
}: {
  coupon: Coupon;
  shortLink: string;
  qrDataUrl: string;
}) {
  const [open, setOpen] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(shortLink);
    toast.success("Đã copy link", { description: shortLink });
  }

  async function copyCode() {
    await navigator.clipboard.writeText(coupon.code);
    toast.success("Đã copy mã", { description: coupon.code });
  }

  function downloadQR() {
    const a = document.createElement("a");
    a.href = qrDataUrl;
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
          onClick={() => setOpen(true)}
          title="Xem QR và chi tiết"
        >
          <EyeIcon className="size-3.5" />
          <span className="sr-only">Preview</span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
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

          <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="rounded-md bg-background p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR" className="size-40" />
            </div>
            <code className="rounded bg-muted px-2 py-1 text-xs">{shortLink}</code>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 text-center text-xs">
            <Stat label="Gói" value={coupon.packageName ?? "—"} mono={false} />
            <Stat
              label="Số tiền"
              value={coupon.orderAmount > 0 ? formatVND(coupon.orderAmount) : "—"}
              accent="info"
            />
          </div>

          <DialogFooter className="flex-row sm:flex-row sm:space-x-2">
            <Button variant="outline" onClick={copyCode} className="flex-1 gap-2">
              <CopyIcon className="size-4" /> Copy mã
            </Button>
            <Button variant="outline" onClick={downloadQR} className="flex-1 gap-2">
              <DownloadIcon className="size-4" /> QR
            </Button>
            <Button onClick={copyLink} className="flex-1 gap-2">
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
