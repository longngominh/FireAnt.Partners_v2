"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TierDot } from "@/components/features/tiers/tier-ui";
import { setContractTierAction } from "@/lib/admin/staff-actions";
import { CONTRACT_TIER_LABELS, CONTRACT_TIERS, TIER_SCHEDULES, type ContractTier } from "@/lib/commission";
import { cn } from "@/lib/utils";

function pct(rate: number): string {
  return `${(rate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

/**
 * Một dòng tóm tắt biểu, vd "Từ 100 tr: phần vượt 18% + 5% tổng". Tháng tính theo loại đơn
 * (`repeatRate`): biểu là của khách mới, gia hạn và nâng cấp tính chung một tỷ lệ.
 */
function tierHint(tier: ContractTier, repeatRate: number | null): string {
  const repeat = repeatRate !== null ? `; gia hạn, nâng cấp ${pct(repeatRate)}` : "";
  if (tier === "normal") {
    return repeatRate !== null ? `Bậc lũy tiến trên khách mới${repeat}` : "Bậc lũy tiến hiện tại, trên doanh số gói hội viên";
  }
  const schedule = TIER_SCHEDULES[tier];
  const top = schedule[schedule.length - 1];
  return `Khách mới từ ${top.from / 1_000_000} tr: phần vượt ${pct(top.excessRate)} + ${pct(top.bonusRate)} tổng${repeat}`;
}

/**
 * Chọn phụ lục đang áp dụng cho đối tác. Lưu là áp dụng cho cả tháng hiện tại từ ngày 01;
 * phí/thù lao tạm tính theo từng phụ lục tính sẵn ở server để quản lý thấy chênh lệch trước khi lưu.
 */
export function ContractTierPicker({
  partnerId,
  current,
  monthLabel,
  monthStart,
  fees,
  repeatRate = null,
}: {
  partnerId: number;
  current: ContractTier;
  /** "tháng 10" */
  monthLabel: string;
  /** "01/10/2026" */
  monthStart: string;
  /** Phí/thù lao tạm tính tháng này nếu áp dụng từng phụ lục, đã định dạng. */
  fees: Record<ContractTier, string>;
  /** Tỷ lệ gia hạn, nâng cấp khi tháng hiện tại tính theo loại đơn (từ SPLIT_POLICY_FROM). */
  repeatRate?: number | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<ContractTier>(current);
  const [isPending, startTransition] = useTransition();
  const changed = picked !== current;

  function save() {
    startTransition(async () => {
      const result = await setContractTierAction(partnerId, picked);
      if (result.ok) {
        toast.success(result.message ?? "Đã lưu phụ lục.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Không lưu được.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Phụ lục áp dụng" className="grid gap-2 sm:grid-cols-2">
        {CONTRACT_TIERS.map((tier) => {
          const on = picked === tier;
          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(tier)}
              disabled={isPending}
              className={cn(
                "flex flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors",
                on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <TierDot tier={tier} className="size-2.5" />
                {CONTRACT_TIER_LABELS[tier]}
                {tier === current ? <span className="text-xs font-medium text-muted-foreground">· đang áp dụng</span> : null}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">{tierHint(tier, repeatRate)}</span>
            </button>
          );
        })}
      </div>

      {changed ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm leading-6">
            Đổi sang phụ lục <strong>{CONTRACT_TIER_LABELS[picked]}</strong>, áp dụng cho cả {monthLabel} (từ {monthStart}).
            Phí/thù lao tạm tính {monthLabel}: <span className="num font-semibold">{fees[current]}</span> →{" "}
            <span className="num font-semibold">{fees[picked]}</span>. Các tháng trước giữ phụ lục đã dùng.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPicked(current)} disabled={isPending}>
              Hủy
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={isPending}>
              {isPending ? "Đang lưu…" : "Lưu phụ lục"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] leading-5 text-muted-foreground">
          Muốn phụ lục mới bắt đầu từ tháng sau thì đổi vào tháng đó. Các tháng trước giữ nguyên phụ lục đã dùng.
        </p>
      )}
    </div>
  );
}
