"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ArrowUpCircleIcon, EyeIcon, ShoppingBagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ServicePackage } from "@/lib/data/packages";
import type { CreatePaymentResult } from "@/lib/payment/types";
import { PurchaseForm } from "./purchase-form";
import { UpgradeForm } from "./upgrade-form";
import { PaymentResultDialog } from "./payment-result-dialog";

export type PartnerOption = { id: number; label: string };

export type CreateMode = "purchase" | "upgrade";

type Props = {
  packages: ServicePackage[];
  isAdmin: boolean;
  /** Danh sách đối tác đang hoạt động (chỉ admin) */
  partners: PartnerOption[];
  /** partnerId của phiên đăng nhập (admin kiêm đối tác) */
  sessionPartnerId: string | null;
  defaultMode?: CreateMode;
};

export function CreatePaymentWorkspace({
  packages,
  isAdmin,
  partners,
  sessionPartnerId,
  defaultMode = "purchase",
}: Props) {
  const [mode, setMode] = useState<CreateMode>(defaultMode);
  const [partnerId, setPartnerId] = useState<string>(
    sessionPartnerId ?? (partners[0] ? String(partners[0].id) : ""),
  );
  const [result, setResult] = useState<CreatePaymentResult | null>(null);
  const [open, setOpen] = useState(false);

  const handleCreated = useCallback((r: CreatePaymentResult) => {
    setResult(r);
    setOpen(true);
    toast.success(r.kind === "upgrade" ? "Tạo link nâng cấp thành công" : "Tạo link thành công", {
      description: `Mã: ${r.code}`,
    });
  }, []);

  // Admin bắt buộc chọn đối tác; partner thường để null để action lấy từ phiên.
  const effectivePartnerId = isAdmin ? partnerId || null : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={(v) => setMode(v as CreateMode)}>
          <TabsList className="h-10 rounded-xl p-1">
            <TabsTrigger value="purchase" className="gap-2 rounded-lg px-4">
              <ShoppingBagIcon className="size-4" />
              Mua gói mới
            </TabsTrigger>
            <TabsTrigger value="upgrade" className="gap-2 rounded-lg px-4">
              <ArrowUpCircleIcon className="size-4" />
              Nâng cấp hội viên
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="partnerSelect" className="text-xs text-muted-foreground">
                Tạo thay cho
              </Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger id="partnerSelect" className="h-9 w-56">
                  <SelectValue placeholder="Chọn đối tác" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {result ? (
            <Button type="button" variant="outline" className="h-9 gap-2" onClick={() => setOpen(true)}>
              <EyeIcon className="size-4" />
              Link gần nhất
            </Button>
          ) : null}
        </div>
      </div>

      {mode === "purchase" ? (
        <PurchaseForm packages={packages} partnerId={effectivePartnerId} onCreated={handleCreated} />
      ) : (
        <UpgradeForm
          partnerId={effectivePartnerId}
          onCreated={handleCreated}
          onSuggestPurchase={() => setMode("purchase")}
        />
      )}

      <PaymentResultDialog result={result} open={open} onOpenChange={setOpen} />
    </div>
  );
}
