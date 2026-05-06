import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type Accent = "default" | "success" | "info" | "warning" | "brand";

const accentMap: Record<Accent, string> = {
  default: "text-foreground",
  success: "text-success",
  info: "text-info",
  warning: "[color:var(--warning-foreground)]",
  brand: "text-brand",
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
        "flex flex-col justify-between gap-3 p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <div
        className={cn(
          "num font-mono text-2xl font-semibold leading-none tracking-tight",
          accentMap[accent],
        )}
      >
        {value}
      </div>
      {hint ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
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
        "flex flex-col justify-between gap-4 overflow-hidden p-6",
        "border-success/30 bg-gradient-to-br from-success/10 via-success/5 to-transparent",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <div
        className={cn(
          "num font-mono text-5xl font-semibold leading-none tracking-tight",
          accent === "success" ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  );
}
