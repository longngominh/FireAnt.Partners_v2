"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelProposalAction } from "@/lib/staff/actions";

export function CancelProposalButton({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await cancelProposalAction(applicationId);
          if (result.ok) {
            toast.success(result.message ?? "Đã hủy đề xuất.");
            router.refresh();
          } else {
            toast.error(result.error ?? "Không hủy được.");
          }
        })
      }
    >
      {isPending ? "Đang hủy…" : "Hủy đề xuất"}
    </Button>
  );
}
