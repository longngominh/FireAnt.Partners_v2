"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePartnerAction } from "@/lib/admin/actions";

type DeletePartnerButtonProps = {
  partnerId: number;
};

export function DeletePartnerButton({ partnerId }: DeletePartnerButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => {
          const confirmed = window.confirm(
            "Xóa cộng tác viên này khỏi danh sách quản lý? Dữ liệu lịch sử vẫn được giữ lại.",
          );
          if (!confirmed) return;

          startTransition(async () => {
            setError(null);
            const result = await deletePartnerAction(partnerId);
            if (!result.ok) {
              setError(result.error ?? "Không thể xóa cộng tác viên.");
              return;
            }

            router.push("/admin/partners");
            router.refresh();
          });
        }}
      >
        <Trash2Icon className="size-3.5" />
        {isPending ? "Đang xóa..." : "Xóa"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
