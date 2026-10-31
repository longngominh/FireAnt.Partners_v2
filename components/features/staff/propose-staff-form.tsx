"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  previewStaffAccountAction,
  proposeStaffAction,
  type StaffAccountPreview,
  type StaffActionState,
} from "@/lib/staff/actions";
import { cn } from "@/lib/utils";

const INITIAL: StaffActionState = { ok: false };

export function ProposeStaffForm({ disabled }: { disabled?: boolean }) {
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<StaffAccountPreview | null>(null);
  const [checking, startCheck] = useTransition();
  const [state, formAction, isPending] = useActionState(proposeStaffAction, INITIAL);

  function check() {
    const value = email.trim();
    if (!value) return;
    startCheck(async () => setPreview(await previewStaffAccountAction(value)));
  }

  if (state.ok) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 shadow-xs">
        <span className="flex size-11 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckIcon className="size-5.5" />
        </span>
        <h2 className="text-lg font-semibold">{state.message}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Đề xuất nằm ở tab Đề xuất của trang Nhân viên bán hàng. Khi FireAnt duyệt, nhân viên đăng nhập bằng tài khoản FireAnt
          và tạo link của riêng mình; doanh số bắt đầu tính cho bạn từ ngày duyệt.
        </p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/team?tab=proposals">Xem đề xuất</Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Đề xuất người khác
          </Button>
        </div>
      </div>
    );
  }

  const ok = preview?.status === "ok";
  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-2">
        <Label htmlFor="staff-email">Email tài khoản FireAnt của nhân viên</Label>
        <div className="flex gap-2">
          <Input
            id="staff-email"
            name="email"
            type="text"
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setPreview(null);
            }}
            onBlur={check}
            placeholder="vd: nhanvien@gmail.com"
            className="h-11"
            disabled={disabled}
            required
          />
          <Button type="button" variant="outline" className="h-11" onClick={check} disabled={disabled || checking || !email.trim()}>
            {checking ? "Đang kiểm tra…" : "Kiểm tra"}
          </Button>
        </div>
        {preview ? (
          <div
            role="status"
            className={cn(
              "flex gap-3 rounded-xl border px-4 py-3 text-sm",
              ok ? "border-success/30 bg-success/10" : "border-warning/40 bg-warning/10",
            )}
          >
            {ok ? (
              <CheckIcon className="mt-0.5 size-4.5 shrink-0 text-success" />
            ) : (
              <TriangleAlertIcon className="mt-0.5 size-4.5 shrink-0 text-warning" />
            )}
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">
                {ok ? "Tài khoản FireAnt đã xác thực · chưa thuộc đối tác nào" : preview.message}
              </span>
              <span className="text-[13px] text-foreground/80">
                {preview.status === "ok"
                  ? `${preview.userName}${preview.phoneMasked ? ` · số điện thoại ${preview.phoneMasked}` : ""}`
                  : "FireAnt chỉ duyệt tài khoản đã xác thực và chưa thuộc đối tác nào. Nhờ nhân viên xử lý rồi gửi lại đề xuất."}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="staff-name">Họ tên</Label>
          <Input id="staff-name" name="fullName" className="h-11" disabled={disabled} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="staff-phone">Số điện thoại</Label>
          <Input id="staff-phone" name="phone" type="tel" inputMode="tel" className="h-11" disabled={disabled} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="staff-note">Ghi chú cho FireAnt (không bắt buộc)</Label>
        <Textarea id="staff-note" name="note" rows={3} placeholder="Vd: nhân viên chính thức từ 09/2026, phụ trách khu vực Thủ Đức" disabled={disabled} />
      </div>

      <div className="rounded-xl border bg-muted/40 px-4 py-3 text-[13px] leading-5 text-foreground/80">
        Nhân viên không có hạng và không nhận thanh toán từ FireAnt. Doanh số qua link của nhân viên được cộng vào doanh thu
        của bạn từ ngày FireAnt duyệt; việc chia thu nhập do bạn tự thỏa thuận với nhân viên.
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <Link href="/team">Hủy</Link>
        </Button>
        <Button type="submit" disabled={disabled || isPending || preview?.status === "problem"}>
          {isPending ? "Đang gửi…" : "Gửi đề xuất"}
        </Button>
      </div>
    </form>
  );
}
