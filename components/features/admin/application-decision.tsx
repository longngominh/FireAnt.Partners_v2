"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckIcon, InfoIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveApplicationAction, rejectApplicationAction } from "@/lib/admin/staff-actions";
import { cn } from "@/lib/utils";

const REASONS = [
  "Tài khoản đang thuộc một đối tác khác.",
  "Tài khoản FireAnt chưa xác thực.",
  "Không tìm thấy tài khoản FireAnt.",
  "Thông tin nhân viên chưa đầy đủ.",
];

type LastDone = { message: string; tone: "success" | "info" };

export type DecisionTarget = {
  id: number;
  name: string;
  partnerName: string;
  /** Lý do không duyệt được (kiểm tra tự động có mục chặn) — vẫn từ chối được. */
  blockedReason: string | null;
};

/**
 * Khối quyết định của hàng chờ duyệt nhân viên. Luôn được render (kể cả khi hết đề xuất) để giữ
 * kết quả lần duyệt/từ chối vừa rồi sau khi trang tải lại danh sách.
 */
export function ApplicationDecision({
  target,
  today,
  children,
}: {
  target: DecisionTarget | null;
  /** Ngày duyệt nếu duyệt hôm nay, dd/MM/yyyy. */
  today: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [currentId, setCurrentId] = useState(target?.id ?? null);
  const [lastDone, setLastDone] = useState<LastDone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Đổi đề xuất đang xem thì bỏ trạng thái từ chối dở dang.
  if ((target?.id ?? null) !== currentId) {
    setCurrentId(target?.id ?? null);
    setRejecting(false);
    setReason("");
    setError(null);
  }

  const blocked = Boolean(target?.blockedReason);

  function approve() {
    if (!target || blocked) return;
    startTransition(async () => {
      const result = await approveApplicationAction(target.id);
      if (result.ok) {
        const message = result.message ?? `Đã duyệt ${target.name}.`;
        toast.success(message);
        setLastDone({ message, tone: "success" });
        router.refresh();
      } else {
        setError(result.error ?? "Không duyệt được.");
      }
    });
  }

  function reject() {
    if (!target) return;
    if (!rejecting) {
      setRejecting(true);
      setReason(target.blockedReason ?? "");
      return;
    }
    startTransition(async () => {
      const result = await rejectApplicationAction(target.id, reason);
      if (result.ok) {
        const message = `Đã từ chối đề xuất ${target.name}. ${target.partnerName} thấy lý do ở trang Nhân viên bán hàng.`;
        toast.success(message);
        setLastDone({ message, tone: "info" });
        router.refresh();
      } else {
        setError(result.error ?? "Không gửi được.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {lastDone ? (
        <div
          role="status"
          className={cn(
            "flex gap-2.5 rounded-xl border px-4 py-3 text-sm leading-6",
            lastDone.tone === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-info/30 bg-info/10 text-info",
          )}
        >
          {lastDone.tone === "success" ? (
            <CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
          ) : (
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
          )}
          {lastDone.message}
        </div>
      ) : null}

      {children}

      {target ? (
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs">
          <h2 className="text-base font-semibold">Khi duyệt</h2>
          <dl className="grid gap-3 rounded-xl border bg-muted/30 p-3.5 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Gắn vào đối tác</dt>
              <dd className="font-semibold">{target.partnerName}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Bắt đầu ghi nhận</dt>
              <dd className="font-semibold">Từ lúc duyệt · {today}</dd>
            </div>
          </dl>
          <p className="text-[13px] leading-5 text-muted-foreground">
            Nhân viên không có hạng, không ký hợp đồng và không nhận thanh toán từ FireAnt. Đối tác tự thỏa thuận việc chia thu
            nhập với nhân viên.
          </p>

          {rejecting ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`reason-${target.id}`}>Lý do từ chối (đối tác và người được đề xuất đều thấy)</Label>
              <div className="flex flex-wrap gap-1.5">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={reason === r}
                    onClick={() => setReason(r)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors",
                      reason === r ? "border-destructive bg-destructive/10 text-destructive" : "hover:bg-muted",
                    )}
                  >
                    {r.replace(/\.$/, "")}
                  </button>
                ))}
              </div>
              <Textarea
                id={`reason-${target.id}`}
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Nhờ đối tác bổ sung họ tên đầy đủ rồi đề xuất lại."
              />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <p className="min-w-0 flex-1 basis-60 text-[13px] leading-5 text-muted-foreground">
              {target.blockedReason
                ? `Không thể duyệt: ${target.blockedReason.replace(/\.$/, "").toLowerCase()}. Hãy từ chối kèm lý do.`
                : "Duyệt sẽ gắn nhân viên vào đối tác từ hôm nay."}
            </p>
            {rejecting ? (
              <Button type="button" variant="ghost" className="h-10 px-4" onClick={() => setRejecting(false)} disabled={isPending}>
                Thôi
              </Button>
            ) : null}
            <Button
              type="button"
              variant={rejecting ? "destructive" : "outline"}
              className="h-10 px-4"
              onClick={reject}
              disabled={isPending || (rejecting && !reason.trim())}
            >
              {rejecting ? (isPending ? "Đang gửi…" : "Gửi từ chối") : "Từ chối"}
            </Button>
            {!rejecting ? (
              <Button type="button" className="h-10 px-4" onClick={approve} disabled={isPending || blocked}>
                {isPending ? "Đang duyệt…" : "Duyệt & gắn vào đối tác"}
              </Button>
            ) : null}
          </div>
        </section>
      ) : !children ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Không còn đề xuất nào chờ duyệt.
        </p>
      ) : null}
    </div>
  );
}
