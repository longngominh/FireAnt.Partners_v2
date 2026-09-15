"use client";

import { CopyIcon } from "lucide-react";
import { copyText } from "./form-bits";

/** Copy nhanh email khách để CTV nhắn nhắc khách đăng ký đúng địa chỉ đó. */
export function CopyEmailButton({ email }: { email: string }) {
  return (
    <button
      type="button"
      onClick={() => copyText(email, "Đã copy email khách")}
      title="Copy email"
      aria-label="Copy email"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <CopyIcon className="size-3" />
    </button>
  );
}
