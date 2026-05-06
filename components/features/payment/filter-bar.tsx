"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "ALL",     label: "Tất cả trạng thái" },
  { value: "PAID",    label: "Đã thanh toán" },
  { value: "PENDING", label: "Chờ thanh toán" },
  { value: "EXPIRED", label: "Hết hạn" },
  { value: "USED",    label: "Đã sử dụng" },
];

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "ALL";

  function update(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === "ALL") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm theo mã, tên hoặc email khách hàng…"
          defaultValue={q}
          onChange={(e) => update({ q: e.target.value })}
          className="pl-9"
        />
      </div>
      <Select value={status} onValueChange={(v) => update({ status: v })}>
        <SelectTrigger className="w-full md:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
