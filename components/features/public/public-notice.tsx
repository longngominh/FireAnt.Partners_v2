import Image from "next/image";
import { AlertTriangleIcon, XCircleIcon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "error";

const TONE: Record<Tone, { icon: typeof InfoIcon; ring: string; iconColor: string }> = {
  info: { icon: InfoIcon, ring: "bg-info/10", iconColor: "text-info" },
  warning: { icon: AlertTriangleIcon, ring: "bg-warning/15", iconColor: "text-warning-foreground dark:text-warning" },
  error: { icon: XCircleIcon, ring: "bg-destructive/10", iconColor: "text-destructive" },
};

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 px-4 py-8 sm:py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <Image src="/logo.png" alt="FireAnt" width={36} height={36} className="rounded-xl shadow-sm" />
          <div className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-tight">FireAnt</span>
            <span className="text-[11px] font-medium text-muted-foreground">Thanh toán an toàn qua OnePay</span>
          </div>
        </div>
        {children}
        <p className="text-center text-xs text-muted-foreground">
          Cần hỗ trợ? Gọi{" "}
          <a href="tel:1900633543" className="font-medium text-foreground underline-offset-4 hover:underline">
            1900 633 543
          </a>{" "}
          hoặc email{" "}
          <a href="mailto:support@fireant.vn" className="font-medium text-foreground underline-offset-4 hover:underline">
            support@fireant.vn
          </a>
        </p>
      </div>
    </div>
  );
}

export function PublicNotice({
  tone = "info",
  title,
  detail,
}: {
  tone?: Tone;
  title: string;
  detail?: string;
}) {
  const cfg = TONE[tone];
  const Icon = cfg.icon;
  return (
    <PublicShell>
      <div className="rounded-2xl border bg-card p-8 text-center shadow-xl shadow-black/5">
        <div className={cn("mx-auto flex size-14 items-center justify-center rounded-full", cfg.ring)}>
          <Icon className={cn("size-7", cfg.iconColor)} />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        {detail ? <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{detail}</p> : null}
      </div>
    </PublicShell>
  );
}
