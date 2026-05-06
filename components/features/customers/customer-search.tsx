"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

export function CustomerSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const q = params.get("q") ?? "";

  function update(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set("q", value);
    else sp.delete("q");
    sp.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`);
    });
  }

  return (
    <div className="relative max-w-sm">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Tìm theo tên, email, SĐT…"
        defaultValue={q}
        onChange={(e) => update(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
