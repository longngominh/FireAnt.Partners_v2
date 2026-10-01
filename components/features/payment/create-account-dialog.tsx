"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleCheckIcon, Loader2Icon, MailIcon, PhoneIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomerAccountAction } from "@/lib/payment/actions";
import { PHONE_INVALID_MESSAGE, PHONE_REQUIRED_MESSAGE, normalizeVnPhone } from "@/lib/payment/phone";
import type { CreateCustomerAccountResult } from "@/lib/payment/types";

export type CreatedAccount = Extract<CreateCustomerAccountResult, { ok: true }>;

type FieldError = { message: string; field?: "email" | "name" | "phone" };

/**
 * Tạo tài khoản FireAnt hộ khách: email + số điện thoại (bắt buộc) + họ tên. FireAnt gửi email
 * để khách tự đặt mật khẩu — CTV không biết mật khẩu của khách.
 *
 * Không dùng <form>: dialog được portal ra body nhưng sự kiện React vẫn nổi lên form tạo link
 * bao ngoài, submit lồng nhau sẽ kích hoạt nhầm form kia. Cha nên đổi `key` mỗi lần mở để
 * ô nhập lấy lại giá trị mặc định.
 */
export function CreateAccountDialog({
  open,
  onOpenChange,
  defaultEmail,
  defaultPhone = "",
  emailLocked = false,
  onCreated,
  onExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string;
  defaultPhone?: string;
  /** Email cố định (đơn đã thu tiền theo email này) */
  emailLocked?: boolean;
  /** phone: số đã chuẩn hoá CTV vừa nhập (để form điền sẵn nếu chưa ghi được vào tài khoản) */
  onCreated: (account: CreatedAccount, phone: string) => void;
  /** Email hoá ra đã có tài khoản */
  onExisting?: (userName: string) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(defaultPhone);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<FieldError | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [pending, startTransition] = useTransition();

  const phoneProblem = !phone.trim() ? PHONE_REQUIRED_MESSAGE : normalizeVnPhone(phone) ? null : PHONE_INVALID_MESSAGE;
  const canSubmit = !!email.trim() && !phoneProblem && confirmed && !pending;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await createCustomerAccountAction({ email, name, phone });
      if (result.ok) {
        setCreated(result);
        onCreated(result, normalizeVnPhone(phone) ?? phone.trim());
        toast.success("Đã tạo tài khoản cho khách", { description: result.userName });
        return;
      }
      setError({ message: result.error, field: result.field });
      if (result.existingUserName) onExisting?.(result.existingUserName);
    });
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlusIcon className="size-4 text-primary" />
            Tạo tài khoản FireAnt cho khách
          </DialogTitle>
          <DialogDescription>
            FireAnt gửi email để khách tự đặt mật khẩu — bạn không biết và không cần biết mật khẩu của khách.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/8 px-4 py-3">
              <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-success" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold">Đã tạo tài khoản</span>
                <span className="break-all text-sm">{created.userName}</span>
              </div>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-start gap-2">
                <MailIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {created.setupEmailSent ? (
                  <span>
                    FireAnt đã gửi email cho khách: <strong className="font-semibold">“Đặt lại mật khẩu”</strong>{" "}
                    (kèm một thư “Xác nhận tài khoản”). Khách bấm link đặt mật khẩu là đăng nhập được.
                  </span>
                ) : (
                  <span className="text-warning-foreground dark:text-warning">
                    Chưa gửi được email đặt mật khẩu. Nhờ khách vào accounts.fireant.vn, chọn “Quên mật khẩu” với
                    email này.
                  </span>
                )}
              </li>
              <li className="flex items-start gap-2">
                <PhoneIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {created.phoneSaved ? (
                  <span>Đã lưu số điện thoại {created.maskedPhone} vào tài khoản.</span>
                ) : (
                  <span className="text-warning-foreground dark:text-warning">
                    Chưa lưu được số điện thoại vào tài khoản — báo admin cập nhật giúp.
                  </span>
                )}
              </li>
            </ul>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Xong
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="newAccountEmail">
                Email của khách <span className="text-destructive">*</span>
              </Label>
              <Input
                id="newAccountEmail"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onEnter}
                readOnly={emailLocked}
                aria-invalid={error?.field === "email"}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">Dùng làm tên đăng nhập. Khách phải mở được hộp thư này.</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="newAccountName">
                Họ tên khách <span className="text-xs font-normal text-muted-foreground">(tuỳ chọn)</span>
              </Label>
              <Input
                id="newAccountName"
                autoComplete="off"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onEnter}
                aria-invalid={error?.field === "name"}
                className="h-9"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="newAccountPhone">
                Số điện thoại <span className="text-destructive">*</span>
              </Label>
              <Input
                id="newAccountPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="VD: 0912345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={onEnter}
                aria-invalid={error?.field === "phone" || (!!phone.trim() && !!phoneProblem)}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">
                {phone.trim() && phoneProblem
                  ? phoneProblem
                  : "Lưu vào tài khoản để khách nhận tin ZNS và học khóa học."}
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>Tôi đã xác nhận đúng email và số điện thoại với khách.</span>
            </label>

            {error ? <p className="text-sm text-destructive">{error.message}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <Button type="button" disabled={!canSubmit} onClick={submit} className="gap-2">
                {pending ? <Loader2Icon className="size-4 animate-spin" /> : <UserPlusIcon className="size-4" />}
                {pending ? "Đang tạo…" : "Tạo tài khoản"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
