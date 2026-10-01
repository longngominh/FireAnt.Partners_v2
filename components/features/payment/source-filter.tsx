"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SOURCE_NONE } from "@/lib/payment/source";
import { cn } from "@/lib/utils";

/**
 * Ô lọc theo nguồn khách, gắn với query ?source= (SOURCE_NONE = chưa gắn nguồn).
 * Dùng chung cho /payment, /admin/partners/[id] và /customers.
 */
export function SourceFilter({ sources, className }: { sources: string[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const raw = params.get("source") ?? "";
  const options = [...sources].sort((a, b) => a.localeCompare(b, "vi"));
  const matched = options.find((o) => o.toLowerCase() === raw.toLowerCase());
  // Nguồn trên URL không còn trong danh sách (link cũ, đổi đối tác…) vẫn hiện để bỏ lọc được.
  if (raw && raw !== SOURCE_NONE && !matched) options.unshift(raw);
  const value = !raw ? "ALL" : raw === SOURCE_NONE ? SOURCE_NONE : (matched ?? raw);

  // Đối tác chưa gắn nguồn cho link nào thì ô lọc không có gì để chọn.
  if (options.length === 0 && value === "ALL") return null;

  function change(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next === "ALL") sp.delete("source");
    else sp.set("source", next);
    sp.delete("page");
    const query = sp.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger className={cn("w-full md:w-44", className)} aria-label="Lọc theo nguồn khách">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">Tất cả nguồn</SelectItem>
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
        <SelectItem value={SOURCE_NONE}>Chưa gắn nguồn</SelectItem>
      </SelectContent>
    </Select>
  );
}
