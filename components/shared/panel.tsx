import Link from "next/link";
import { cn } from "@/lib/utils";

/** Khối nội dung chuẩn: tiêu đề + mô tả + thao tác góc phải. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Nội dung chạm viền (bảng) — header có đường kẻ phân cách. */
  flush?: boolean;
}) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border bg-card text-card-foreground shadow-xs", className)}>
      {hasHeader ? (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-3 px-5 pt-5",
            flush ? "border-b pb-4" : "pb-1",
          )}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(flush ? "" : "px-5 pb-5", hasHeader || flush ? "" : "pt-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-semibold text-primary hover:underline">
      {children}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "success" | "warning";
  href?: string;
  /** Dòng so sánh với tháng trước (KpiDelta), luôn nằm đáy thẻ. */
  trend?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-bold tracking-tight",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-[13px] leading-5 text-muted-foreground">{hint}</span> : null}
      {trend ? <div className="mt-auto pt-2">{trend}</div> : null}
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-card px-5 py-4 text-card-foreground shadow-xs",
    tone === "warning" && "border-warning/40",
    href && "transition-colors hover:border-primary/40",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
