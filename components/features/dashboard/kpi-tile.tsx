import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type Accent = "default" | "success" | "info" | "warning" | "brand";

const accentTextMap: Record<Accent, string> = {
  default: "text-foreground",
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  brand: "text-brand",
};

const accentIconMap: Record<Accent, string> = {
  default: "text-muted-foreground",
  success: "text-success/70",
  info: "text-info/70",
  warning: "text-warning/70",
  brand: "text-brand/70",
};

export function KpiTile({
  label,
  value,
  hint,
  accent = "default",
  className,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: Accent;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col justify-between gap-3 p-5 transition-shadow duration-200 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80 leading-tight">
          {label}
        </span>
        {icon ? (
          <span className={cn("shrink-0 rounded-md p-1.5", accentIconMap[accent])}>
            {icon}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "num font-mono text-2xl font-bold leading-none tracking-tight",
          accentTextMap[accent],
        )}
      >
        {value}
      </div>
      {hint ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">{hint}</p>
      ) : null}
    </Card>
  );
}

export function HeroTile({
  label,
  value,
  hint,
  accent = "success",
  icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: Accent;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "relative flex flex-col justify-between gap-4 overflow-hidden p-6",
        "border-success/25 bg-gradient-to-br from-success/12 via-success/5 to-transparent",
        "transition-shadow duration-200 hover:shadow-md",
        className,
      )}
    >
      {/* Decorative circle */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-success/8" />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          {label}
        </span>
        {icon ? (
          <span className="shrink-0 rounded-lg bg-success/15 p-2 text-success">
            {icon}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "num font-mono text-4xl font-bold leading-none tracking-tight sm:text-5xl",
          accent === "success" ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </div>

      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground/80">{hint}</p>
      ) : null}
    </Card>
  );
}
