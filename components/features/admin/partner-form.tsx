"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/lib/commission";
import type { Partner } from "@/lib/data/partners";
import type { PartnerPaymentInfo } from "@/lib/data/partner-payment-info";
import type { PartnerFormState } from "@/lib/admin/actions";

type PartnerFormProps = {
  action: (prevState: PartnerFormState, formData: FormData) => Promise<PartnerFormState>;
  partner?: Partner;
  paymentInfo?: PartnerPaymentInfo;
};

const initialState: PartnerFormState = { ok: false };

export function PartnerForm({ action, partner, paymentInfo }: PartnerFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const mode = partner ? "edit" : "create";
  const defaultType: PartnerType = partner?.partnerType ?? "collaborator";

  return (
    <Card className="max-w-2xl">
      <CardContent className="p-6">
        <form action={formAction} className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="username">Tài khoản FireAnt</Label>
            <Input
              id="username"
              name="username"
              defaultValue={partner?.username ?? ""}
              placeholder="vd: partner@fireant.vn"
              autoComplete="off"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="partnerType">Loại cộng tác viên</Label>
            <select
              id="partnerType"
              name="partnerType"
              defaultValue={defaultType}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="sales_employee">{PARTNER_TYPE_LABELS.sales_employee}</option>
              <option value="collaborator">{PARTNER_TYPE_LABELS.collaborator}</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={partner?.isActive ?? true}
              className="size-4 rounded border-input"
            />
            Đang hoạt động
          </label>

          <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Thông tin chi trả</p>
              <p className="text-xs text-muted-foreground">
                Dùng cho Giấy đề nghị thanh toán hoa hồng hàng tháng.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fullName">Họ tên trên chứng từ</Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={paymentInfo?.fullName ?? ""}
                placeholder="Tên đầy đủ trùng với tài khoản ngân hàng"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="bankAccountNumber">Số tài khoản</Label>
                <Input
                  id="bankAccountNumber"
                  name="bankAccountNumber"
                  defaultValue={paymentInfo?.bankAccountNumber ?? ""}
                  placeholder="vd: 0071001711898"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bankName">Ngân hàng</Label>
                <Input
                  id="bankName"
                  name="bankName"
                  defaultValue={paymentInfo?.bankName ?? ""}
                  placeholder="vd: Vietcombank"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          {state.error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.message ? (
            <p className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Đang lưu..."
                : mode === "edit"
                  ? "Lưu thay đổi"
                  : "Thêm cộng tác viên"}
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href="/admin/partners">Hủy</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
