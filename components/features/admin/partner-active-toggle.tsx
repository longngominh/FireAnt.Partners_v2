"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { togglePartnerActiveAction } from "@/lib/admin/actions";

/** Tạm dừng / kích hoạt lại đối tác: tạm dừng thì đối tác không đăng nhập và tạo link được. */
export function PartnerActiveToggle({ partnerId, isActive, name }: { partnerId: number; isActive: boolean; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (
      isActive &&
      !window.confirm(`Tạm dừng ${name}? Đối tác không đăng nhập được, nhân viên của họ không tạo được link mới.`)
    ) {
      return;
    }
    startTransition(async () => {
      const result = await togglePartnerActiveAction(partnerId, !isActive);
      if (result.ok) {
        toast.success(isActive ? `Đã tạm dừng ${name}.` : `Đã kích hoạt lại ${name}.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Không lưu được.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" className="h-10 gap-2" onClick={toggle} disabled={isPending}>
      {isActive ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
      {isPending ? "Đang lưu…" : isActive ? "Tạm dừng" : "Kích hoạt lại"}
    </Button>
  );
}
