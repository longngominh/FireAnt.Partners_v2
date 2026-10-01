"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookupCustomerAction } from "@/lib/payment/actions";
import type { CustomerLookup } from "@/lib/payment/types";

const DEBOUNCE_MS = 450;

/**
 * Tra tài khoản FireAnt của khách khi CTV ngừng gõ. Kết quả gắn với chuỗi đã tra (`input`)
 * nên chỉ dùng khi còn khớp ô nhập; phản hồi về muộn của chuỗi cũ bị bỏ qua.
 */
export function useCustomerLookup(value: string) {
  const trimmed = value.trim();
  const [result, setResult] = useState<CustomerLookup | null>(null);
  const [nonce, setNonce] = useState(0);
  const latest = useRef("");

  useEffect(() => {
    latest.current = trimmed;
    if (!trimmed) return;
    const timer = window.setTimeout(async () => {
      let next: CustomerLookup;
      try {
        next = await lookupCustomerAction(trimmed);
      } catch {
        next = { status: "invalid", input: trimmed, error: "Chưa tra được tài khoản, vui lòng thử lại." };
      }
      if (latest.current === trimmed) setResult(next);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed, nonce]);

  const lookup = result && result.input === trimmed ? result : null;

  return {
    lookup,
    checking: trimmed !== "" && !lookup,
    /** Tra lại cùng chuỗi (lỗi mạng, vừa tạo tài khoản ở nơi khác…) */
    refresh: useCallback(() => setNonce((n) => n + 1), []),
    /** Ghi kết quả có sẵn (vd. vừa tạo tài khoản xong) mà không chờ tra lại */
    setLookup: setResult,
  };
}
