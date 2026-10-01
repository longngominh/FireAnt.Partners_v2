"use client";

import { CircleCheckIcon, Loader2Icon, PhoneIcon, RefreshCwIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PHONE_INVALID_MESSAGE, normalizeVnPhone } from "@/lib/payment/phone";
import type { CustomerLookup } from "@/lib/payment/types";

/** Dòng trạng thái dưới ô "Tài khoản FireAnt" của form mua gói. */
export function CustomerLookupStatus({
  lookup,
  checking,
  serverError,
  onCreateAccount,
  onRetry,
}: {
  lookup: CustomerLookup | null;
  checking: boolean;
  /** Lỗi server trả về sau khi bấm tạo link */
  serverError?: string;
  onCreateAccount: () => void;
  onRetry: () => void;
}) {
  if (checking) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Đang kiểm tra tài khoản…
      </p>
    );
  }

  if (lookup?.status === "account") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <CircleCheckIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          Tài khoản FireAnt: <strong className="font-semibold">{lookup.userName}</strong>
        </span>
      </p>
    );
  }

  if (lookup?.status === "new-email") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
        <p className="text-xs leading-relaxed">
          <strong className="font-semibold">Email này chưa có tài khoản FireAnt.</strong> Tạo tài khoản hộ khách để
          gói kích hoạt ngay khi nhận tiền và áp được mã khuyến mại.
        </p>
        <Button type="button" size="sm" onClick={onCreateAccount} className="h-8 w-fit gap-1.5">
          <UserPlusIcon className="size-3.5" />
          Tạo tài khoản cho khách
        </Button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Hoặc vẫn tạo link: khách phải tự đăng ký đúng email này thì gói mới có hiệu lực.
        </p>
      </div>
    );
  }

  if (lookup?.status === "invalid") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-destructive">
        <span>{lookup.error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          <RefreshCwIcon className="size-3" />
          Kiểm tra lại
        </button>
      </p>
    );
  }

  if (serverError) return <p className="text-xs text-destructive">{serverError}</p>;

  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Nhập username hoặc email đăng nhập. Khách chưa có tài khoản thì nhập <strong>email</strong> khách sẽ dùng — có
      thể tạo tài khoản hộ khách ngay tại đây.
    </p>
  );
}

/**
 * Ô "Số điện thoại" — bắt buộc khi mua gói hội viên / khóa học. Tài khoản đã có số thì dùng
 * số đó (chỉ hiện bản che, không gửi field); chưa có thì CTV nhập và số được lưu vào tài khoản.
 */
export function CustomerPhoneField({
  id,
  lookup,
  value,
  onChange,
  serverError,
}: {
  id: string;
  lookup: CustomerLookup | null;
  value: string;
  onChange: (value: string) => void;
  serverError?: string;
}) {
  if (lookup?.status === "account" && lookup.hasPhone) {
    return (
      <div className="flex flex-col gap-2">
        <Label>Số điện thoại</Label>
        <div className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm">
          <PhoneIcon className="size-4 text-muted-foreground" />
          <span className="num font-medium">{lookup.maskedPhone}</span>
          <span className="text-xs text-muted-foreground">· có sẵn trong tài khoản</span>
        </div>
        <p className="text-xs text-muted-foreground">Khách đổi số thì tự xác thực OTP trên fireant.vn.</p>
      </div>
    );
  }

  const invalid = value.trim() !== "" && !normalizeVnPhone(value);
  const hint =
    lookup?.status === "account"
      ? "Tài khoản chưa có số — số này sẽ được lưu vào tài khoản của khách."
      : lookup?.status === "new-email"
        ? "Lưu trên link; tạo tài khoản hộ khách thì số được lưu vào tài khoản."
        : "Bắt buộc với gói hội viên và khóa học.";

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        Số điện thoại <span className="text-destructive">*</span>
      </Label>
      <div className="relative">
        <PhoneIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          name="customerPhone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="VD: 0912345678"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || !!serverError}
          className="h-9 pl-9"
        />
      </div>
      <p className={invalid || serverError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {invalid ? PHONE_INVALID_MESSAGE : serverError ?? hint}
      </p>
    </div>
  );
}
