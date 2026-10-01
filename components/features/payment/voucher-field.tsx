"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Loader2Icon, TicketPercentIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND } from "@/lib/utils/currency";
import { previewVoucherAction } from "@/lib/payment/actions";
import { normalizeVoucherCode } from "@/lib/payment/voucher-link";
import type { VoucherPreview } from "@/lib/payment/types";

/** Kết quả kiểm tra còn khớp với mã + gói + khách đang nhập không. */
export function isCurrentPreview(
  preview: VoucherPreview | null,
  code: string,
  packageId: number | null,
  customer: string,
): preview is VoucherPreview {
  return (
    !!preview &&
    preview.code === normalizeVoucherCode(code) &&
    preview.packageId === packageId &&
    preview.customer === customer.trim()
  );
}

/**
 * Ô "Mã khuyến mại" của form mua gói. Mã do admin tạo ở admin.fireant.vn — CTV chỉ nhập.
 * "Áp dụng" chỉ kiểm tra (không ghi gì); lượt dùng của mã bị tính khi bấm tạo link và server
 * luôn kiểm tra lại lúc đó.
 */
export function VoucherField({
  code,
  onCodeChange,
  preview,
  onPreviewChange,
  packageId,
  customer,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  preview: VoucherPreview | null;
  onPreviewChange: (preview: VoucherPreview | null) => void;
  packageId: number | null;
  customer: string;
}) {
  const [checking, startChecking] = useTransition();
  const normalized = normalizeVoucherCode(code);
  const current = isCurrentPreview(preview, code, packageId, customer) ? preview : null;
  const applied = current?.ok ? current : null;
  const rejected = current && !current.ok ? current : null;
  // Đã áp thành công rồi mới đổi gói/khách: báo kiểm tra lại thay vì lặng lẽ bỏ mã.
  const stale = !current && preview?.ok === true && preview.code === normalized;

  const missingContext = !packageId ? "Chọn gói ở bước 1 trước." : !customer.trim() ? "Nhập tài khoản khách trước." : null;

  function apply() {
    if (!normalized || !packageId || !customer.trim()) return;
    startChecking(async () => {
      onPreviewChange(await previewVoucherAction({ code: normalized, packageId, customer }));
    });
  }

  function clear() {
    onCodeChange("");
    onPreviewChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="voucherCode">
        Mã khuyến mại <span className="text-xs font-normal text-muted-foreground">(tuỳ chọn)</span>
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <TicketPercentIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="voucherCode"
            autoComplete="off"
            spellCheck={false}
            placeholder="Nhập mã"
            maxLength={20}
            value={code}
            onChange={(e) => onCodeChange(normalizeVoucherCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Enter trong ô mã = Áp dụng, không submit cả form.
                e.preventDefault();
                if (!applied) apply();
              }
            }}
            readOnly={!!applied}
            aria-invalid={!!rejected}
            className="h-9 pl-9 font-mono tracking-wide"
          />
        </div>
        {applied ? (
          <Button type="button" variant="outline" onClick={clear} className="h-9 gap-1.5 px-3">
            <XIcon className="size-3.5" />
            Bỏ mã
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={apply}
            disabled={checking || !normalized || !!missingContext}
            className="h-9 gap-2 px-4"
          >
            {checking ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Áp dụng
          </Button>
        )}
      </div>

      {applied ? (
        <div className="rounded-lg border border-success/30 bg-success/8 px-3 py-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-success">{applied.title}</span>
            <span className="num shrink-0 font-semibold text-success">
              {applied.discountAmount > 0 ? `−${formatVND(applied.discountAmount)}` : applied.benefit}
            </span>
          </div>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">
            {applied.expiresAt
              ? `HSD ${format(new Date(applied.expiresAt), "dd/MM/yyyy", { locale: vi })}`
              : null}
            {applied.remainingUses !== null ? ` · còn ${applied.remainingUses} lượt` : null}
            {" · "}Tạo link sẽ dùng 1 lượt của mã.
          </p>
        </div>
      ) : rejected ? (
        <p className="text-xs text-destructive">{rejected.error}</p>
      ) : stale ? (
        <p className="text-xs text-warning-foreground dark:text-warning">
          Gói hoặc tài khoản khách đã đổi — bấm <strong className="font-semibold">Áp dụng</strong> để kiểm tra lại mã.
        </p>
      ) : normalized ? (
        <p className="text-xs text-muted-foreground">
          {missingContext ?? "Bấm Áp dụng để kiểm tra mã trước khi tạo link."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Mã do FireAnt cấp, chỉ dùng cho khách đã có tài khoản.</p>
      )}
    </div>
  );
}
