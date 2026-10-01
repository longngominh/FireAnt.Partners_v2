"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateAccountDialog } from "./create-account-dialog";

/**
 * Nút "Tạo tài khoản" cho đơn ĐÃ THU TIỀN theo email chưa có tài khoản (/payment/pending-account).
 * Gói đã ghi theo UserName = email, nên tạo đúng email đó là khách nhận được gói ngay khi đặt
 * mật khẩu; tạo xong thì làm mới trang để đơn rời danh sách.
 */
export function CreateAccountButton({ email, phone }: { email: string; phone: string | null }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5"
        onClick={() => setDialog((d) => ({ open: true, key: d.key + 1 }))}
      >
        <UserPlusIcon className="size-3.5" />
        Tạo tài khoản
      </Button>
      <CreateAccountDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(open) => {
          setDialog((d) => ({ ...d, open }));
          if (!open) router.refresh();
        }}
        defaultEmail={email}
        defaultPhone={phone ?? ""}
        emailLocked
        onCreated={() => {}}
        onExisting={() => router.refresh()}
      />
    </>
  );
}
