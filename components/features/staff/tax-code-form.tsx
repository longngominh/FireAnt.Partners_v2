"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTaxCodeAction, type ProfileActionState } from "@/lib/partner/profile-actions";

const INITIAL: ProfileActionState = { ok: false };

export function TaxCodeForm({ current }: { current: string | null }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(async (prev: ProfileActionState, formData: FormData) => {
    const result = await updateTaxCodeAction(prev, formData);
    if (result.ok) setEditing(false);
    return result;
  }, INITIAL);

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-2">
        {state.ok && state.message ? <p className="text-[13px] text-success">{state.message}</p> : null}
        <Button type="button" variant="outline" onClick={() => setEditing(true)}>
          {current ? "Sửa mã số thuế" : "Cập nhật mã số thuế"}
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3.5">
      <Label htmlFor="tax-code">Mã số thuế</Label>
      <Input id="tax-code" name="taxCode" inputMode="numeric" defaultValue={current ?? ""} className="h-10" required />
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={isPending}>
          Hủy
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Đang lưu…" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}
