"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CopyIcon, DownloadIcon, EyeIcon, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatVND } from "@/lib/utils/currency";
import { createPaymentAction } from "@/lib/payment/actions";
import {
  createPaymentInitialState,
  type CreatePaymentState,
} from "@/lib/payment/types";
import type { ServicePackage } from "@/lib/data/packages";

type Props = { packages: ServicePackage[] };

const SERVICE_BADGE: Record<number, { label: string; color: string }> = {
  33: { label: "Thiết yếu",      color: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  34: { label: "Chuyên nghiệp",  color: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  35: { label: "Cao cấp",        color: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
};

export function CreatePaymentForm({ packages }: Props) {
  const [state, action, pending] = useActionState<CreatePaymentState, FormData>(
    createPaymentAction,
    createPaymentInitialState,
  );

  // Nhóm packages theo serviceId
  const services = useMemo(() => {
    const map = new Map<number, ServicePackage[]>();
    for (const pkg of packages) {
      if (!map.has(pkg.serviceId)) map.set(pkg.serviceId, []);
      map.get(pkg.serviceId)!.push(pkg);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([serviceId, pkgs]) => ({
        serviceId,
        serviceName: pkgs[0].serviceName,
        packages: pkgs.sort((a, b) => a.months - b.months),
      }));
  }, [packages]);

  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(
    services[0]?.serviceId ?? null,
  );
  const [selectedPackage, setSelectedPackage] = useState<ServicePackage | null>(null);

  const currentServicePackages = useMemo(
    () => services.find((s) => s.serviceId === selectedServiceId)?.packages ?? [],
    [services, selectedServiceId],
  );

  // Reset package khi đổi service
  function handleSelectService(serviceId: number) {
    setSelectedServiceId(serviceId);
    setSelectedPackage(null);
  }

  const amount = selectedPackage?.amount ?? 0;

  const [previewOpen, setPreviewOpen] = useState(false);
  const lastSeenCodeRef = useRef<string | null>(null);
  const lastSeenErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.ok && state.result && state.result.code !== lastSeenCodeRef.current) {
      lastSeenCodeRef.current = state.result.code;
      toast.success("Tạo link thành công", { description: `Mã: ${state.result.code}` });
      setPreviewOpen(true);
      setSelectedPackage(null);
    } else if (state.error && state.error !== lastSeenErrorRef.current) {
      lastSeenErrorRef.current = state.error;
      toast.error(state.error);
    }
  }, [state]);

  const result = state.result;

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.shortLink);
    toast.success("Đã copy link");
  }

  async function copyCode() {
    if (!result) return;
    await navigator.clipboard.writeText(result.code);
    toast.success("Đã copy mã coupon");
  }

  function downloadQR() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.qrDataUrl;
    a.download = `qr-${result.code}.png`;
    a.click();
  }

  const canSubmit = !!selectedPackage && !pending;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_360px]">
      <form action={action} className="flex flex-col gap-4">
        {/* Hidden fields */}
        {selectedPackage && (
          <>
            <input type="hidden" name="packageId" value={selectedPackage.packageId} />
            <input type="hidden" name="amount" value={Math.round(selectedPackage.amount)} />
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chọn gói dịch vụ</CardTitle>
            <CardDescription>
              Chọn gói và thời hạn để tạo link thanh toán.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Service selector */}
            {packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không tải được danh sách gói.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Loại gói
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {services.map((s) => {
                      const badge = SERVICE_BADGE[s.serviceId];
                      const active = selectedServiceId === s.serviceId;
                      return (
                        <button
                          key={s.serviceId}
                          type="button"
                          onClick={() => handleSelectService(s.serviceId)}
                          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                            active
                              ? `${badge?.color ?? ""} ring-2 ring-offset-1 ring-current`
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {s.serviceName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Duration/Package grid */}
                {selectedServiceId !== null && (
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Thời hạn & Giá
                    </Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {currentServicePackages.map((pkg) => {
                        const active = selectedPackage?.packageId === pkg.packageId;
                        const badge = SERVICE_BADGE[pkg.serviceId];
                        return (
                          <button
                            key={pkg.packageId}
                            type="button"
                            onClick={() => setSelectedPackage(pkg)}
                            className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                              active
                                ? `${badge?.color ?? ""} ring-2 ring-offset-1 ring-current`
                                : "border-border bg-background hover:bg-muted"
                            }`}
                          >
                            <span className="text-xs font-medium text-muted-foreground">
                              {pkg.months === 1
                                ? "1 tháng"
                                : pkg.months === 12
                                ? "1 năm"
                                : `${pkg.months} tháng`}
                            </span>
                            <span className="num mt-1 text-sm font-semibold">
                              {formatVND(pkg.amount)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {state.fieldErrors?.packageId && (
                      <p className="text-xs text-destructive">{state.fieldErrors.packageId[0]}</p>
                    )}
                  </div>
                )}

                {/* Selected summary */}
                {selectedPackage && (
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Đã chọn</span>
                    <span className="font-medium">
                      {selectedPackage.packageName ?? selectedPackage.serviceName}
                    </span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thông tin khách hàng</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="customerEmail">
                Tài khoản FireAnt{" "}
                <span className="text-xs font-normal text-destructive">*</span>
              </Label>
              <Input
                id="customerEmail"
                name="customerEmail"
                type="text"
                placeholder="username hoặc email đăng nhập FireAnt"
                required
              />
              {state.fieldErrors?.customerEmail && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.customerEmail[0]}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="note">
                Ghi chú{" "}
                <span className="text-xs font-normal text-muted-foreground">(tuỳ chọn)</span>
              </Label>
              <Input id="note" name="note" placeholder="Khuyến mãi 30/4" maxLength={500} />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          {result ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              className="gap-2"
            >
              <EyeIcon className="size-4" />
              Xem link gần nhất
            </Button>
          ) : null}
          <Button type="submit" disabled={!canSubmit} className="min-w-32 gap-2">
            <LinkIcon className="size-4" />
            {pending ? "Đang tạo…" : "Tạo link"}
          </Button>
        </div>
      </form>


      {/* Result dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link thanh toán đã sẵn sàng</DialogTitle>
            <DialogDescription>
              Chia sẻ link hoặc QR cho khách hàng để hoàn tất thanh toán.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
                <div className="rounded-md bg-background p-2 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.qrDataUrl} alt="QR thanh toán" className="size-44" />
                </div>
                <code className="rounded bg-muted px-2 py-1 text-xs">{result.shortLink}</code>
              </div>

              <div className="grid grid-cols-1 gap-2 rounded-lg border bg-card p-3 text-center text-xs">
                <Stat label="Giá gói" value={formatVND(result.orderAmount)} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">Mã coupon</span>
                  <code className="font-mono font-medium">{result.code}</code>
                </div>
                {result.customerEmail ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Tài khoản FireAnt</span>
                    <span className="truncate font-medium">{result.customerEmail}</span>
                  </div>
                ) : null}
                {result.note ? (
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Ghi chú</span>
                    <span className="font-medium">{result.note}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row sm:flex-row sm:justify-between sm:space-x-2">
            <Button variant="outline" onClick={copyCode} className="flex-1 gap-2">
              <CopyIcon className="size-4" /> Copy mã
            </Button>
            <Button variant="outline" onClick={downloadQR} className="flex-1 gap-2">
              <DownloadIcon className="size-4" /> QR
            </Button>
            <Button onClick={copyLink} className="flex-1 gap-2">
              <CopyIcon className="size-4" /> Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "info";
}) {
  const color =
    accent === "success" ? "text-success" : accent === "info" ? "text-info" : "text-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`num font-mono text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}
