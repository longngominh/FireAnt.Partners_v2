"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOURCE_MAX_LENGTH, normalizeSource } from "@/lib/payment/source";
import { cn } from "@/lib/utils";

/**
 * Ô "Nguồn khách": nhập tự do, bấm chip để chọn nhanh kênh có sẵn / nguồn đã dùng.
 * Gửi lên server qua field `source`.
 */
export function SourceField({
  id,
  value,
  onChange,
  suggestions,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Đã gộp kênh có sẵn + nguồn đã dùng (xem sourceSuggestions) */
  suggestions: string[];
  error?: string;
}) {
  const current = normalizeSource(value)?.toLowerCase() ?? null;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        Nguồn khách <span className="text-xs font-normal text-muted-foreground">(tuỳ chọn)</span>
      </Label>
      <Input
        id={id}
        name="source"
        autoComplete="off"
        placeholder="VD: Zalo, TikTok, Team 1…"
        maxLength={SOURCE_MAX_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className="h-9"
      />
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Chọn nhanh nguồn">
          {suggestions.map((s) => {
            const active = current === s.toLowerCase();
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? "" : s)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors outline-none",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Để theo dõi khách đến từ kênh nào. Khách không thấy.</p>
      )}
    </div>
  );
}
