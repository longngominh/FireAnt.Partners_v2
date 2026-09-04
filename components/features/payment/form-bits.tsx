"use client";

import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { tierMeta } from "@/lib/payment/tiers";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Step card                                                           */
/* ------------------------------------------------------------------ */

export function StepCard({
  step,
  title,
  description,
  aside,
  children,
  className,
}: {
  step: number;
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {step}
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold leading-6">{title}</h2>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {aside}
      </div>
      <CardContent className="flex flex-col gap-5 px-5 py-5">{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Tier badge                                                          */
/* ------------------------------------------------------------------ */

export function TierBadge({
  serviceId,
  size = "sm",
  showTag = false,
  className,
}: {
  serviceId: number;
  size?: "sm" | "md";
  showTag?: boolean;
  className?: string;
}) {
  const meta = tierMeta(serviceId);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        meta.badge,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
      {showTag && meta.tag ? <span className="font-medium opacity-70">· {meta.tag}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Selectable card (radio-like)                                        */
/* ------------------------------------------------------------------ */

export function ChoiceCard({
  active,
  disabled,
  onSelect,
  accentClass,
  children,
  className,
}: {
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  /** Lớp màu khi active (mặc định primary) */
  accentClass?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group/choice relative w-full rounded-xl border bg-card text-left transition-all duration-150 outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        disabled
          ? "cursor-not-allowed opacity-55"
          : active
            ? accentClass ?? "border-primary bg-primary/5 ring-2 ring-primary/30"
            : "border-border hover:border-primary/40 hover:bg-muted/40",
        className,
      )}
    >
      {children}
      {active ? (
        <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <CheckIcon className="size-3" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

export function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        active ? "border-primary" : "border-muted-foreground/40 group-hover/choice:border-primary/60",
      )}
    >
      {active ? <span className="size-2 rounded-full bg-primary" /> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Summary (sticky aside)                                              */
/* ------------------------------------------------------------------ */

export function SummaryCard({
  title = "Tóm tắt",
  children,
  footer,
}: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0 lg:sticky lg:top-6">
      <div className="border-b px-5 py-3.5">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <CardContent className="flex flex-col gap-4 px-5 py-5">{children}</CardContent>
      {footer ? <div className="border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground">{footer}</div> : null}
    </Card>
  );
}

export function SummaryRow({
  label,
  children,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right font-medium", muted && "font-normal text-muted-foreground")}>
        {children}
      </span>
    </div>
  );
}

export function SummaryEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Callout                                                             */
/* ------------------------------------------------------------------ */

export function Callout({
  tone = "info",
  title,
  detail,
  action,
}: {
  tone?: "info" | "warning" | "success" | "error";
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  const tones = {
    info: "border-info/30 bg-info/8 text-foreground",
    warning: "border-warning/40 bg-warning/10 text-foreground",
    success: "border-success/30 bg-success/8 text-foreground",
    error: "border-destructive/30 bg-destructive/8 text-foreground",
  };
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold">{title}</p>
        {detail ? <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Không copy được — trình duyệt chặn clipboard.");
  }
}

/** Tải ảnh QR (kể cả ảnh cross-origin từ VietQR); nếu bị chặn CORS thì mở tab mới. */
export async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function perMonth(amount: number, months: number): number {
  return months > 0 ? amount / months : amount;
}
