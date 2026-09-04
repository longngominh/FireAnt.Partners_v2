"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 20 * 60_000;

/**
 * Poll trạng thái đơn nâng cấp; khi webhook OnePay đã xử lý xong thì refresh trang
 * để server render màn "Nâng cấp thành công" (mirror PollOrderStatus của Upgrade.razor).
 */
export function UpgradeStatusPoller({ code }: { code: string }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    if (startedAt.current === null) startedAt.current = Date.now();

    async function tick() {
      if (cancelled) return;
      if (Date.now() - (startedAt.current ?? Date.now()) > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/p/${encodeURIComponent(code)}/status`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { paid?: boolean; expired?: boolean };
          if (data.paid || data.expired) {
            router.refresh();
            return;
          }
        }
      } catch {
        // mạng chập chờn — thử lại ở nhịp sau
      }
      timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    }

    timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [code, router]);

  if (timedOut) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa ghi nhận thanh toán. Nếu bạn đã chuyển tiền, gói sẽ được nâng cấp ngay khi ngân hàng báo có —{" "}
        <button
          type="button"
          onClick={() => {
            startedAt.current = Date.now();
            setTimedOut(false);
            router.refresh();
          }}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          kiểm tra lại
        </button>
        .
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="relative flex size-2.5 shrink-0">
        <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
      </span>
      <span className="text-sm text-muted-foreground">
        Đang chờ thanh toán — gói sẽ được{" "}
        <strong className="font-semibold text-foreground">nâng cấp tự động</strong> ngay khi hệ thống nhận được
        tiền. Trang này tự cập nhật.
      </span>
    </div>
  );
}
