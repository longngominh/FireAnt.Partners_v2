"use client";

import { InfoIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function CreatePartnerForm() {
  return (
    <Card className="max-w-2xl">
      <CardContent className="flex items-start gap-3 p-6">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tài khoản đối tác được quản lý thông qua{" "}
          <strong>IdentityServer4</strong> tại{" "}
          <a
            href="https://accounts.fireant.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            accounts.fireant.vn
          </a>
          . Để cấp quyền cho đối tác mới, hãy thêm user vào bảng{" "}
          <code className="rounded bg-muted px-1 text-xs">Partners</code>{" "}
          trong DB và đảm bảo{" "}
          <code className="rounded bg-muted px-1 text-xs">UserId</code> khớp
          với <code className="rounded bg-muted px-1 text-xs">sub</code> trên
          IS4.
        </p>
      </CardContent>
    </Card>
  );
}
