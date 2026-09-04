"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LinkIcon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND } from "@/lib/utils/currency";
import { createPaymentAction } from "@/lib/payment/actions";
import { createPaymentInitialState, type CreatePaymentResult, type CreatePaymentState } from "@/lib/payment/types";
import { durationLabel, tierMeta } from "@/lib/payment/tiers";
import type { ServicePackage } from "@/lib/data/packages";
import { cn } from "@/lib/utils";
import {
  ChoiceCard,
  StepCard,
  SummaryCard,
  SummaryEmpty,
  SummaryRow,
  TierBadge,
  perMonth,
} from "./form-bits";

type Props = {
  packages: ServicePackage[];
  /** Admin tạo thay cho đối tác; partner thường để null (lấy từ phiên) */
  partnerId: string | null;
  onCreated: (result: CreatePaymentResult) => void;
};

type ServiceGroup = {
  serviceId: number;
  serviceName: string;
  isCourse: boolean;
  packages: ServicePackage[];
};

export function PurchaseForm({ packages, partnerId, onCreated }: Props) {
  const [state, action, pending] = useActionState<CreatePaymentState, FormData>(
    createPaymentAction,
    createPaymentInitialState,
  );

  const services = useMemo<ServiceGroup[]>(() => {
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
        isCourse: pkgs[0].isCourse,
        packages: pkgs[0].isCourse
          ? [...pkgs].sort((a, b) => (a.packageName ?? "").localeCompare(b.packageName ?? "", "vi"))
          : [...pkgs].sort((a, b) => a.months - b.months),
      }));
  }, [packages]);

  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(services[0]?.serviceId ?? null);
  const [selectedPackage, setSelectedPackage] = useState<ServicePackage | null>(null);
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");

  const currentService = services.find((s) => s.serviceId === selectedServiceId) ?? null;
  const isCourse = currentService?.isCourse ?? false;

  // Giá tham chiếu (gói ngắn nhất của hạng) để hiển thị % tiết kiệm của gói dài hơn
  const baseMonthly = useMemo(() => {
    if (!currentService || currentService.isCourse) return null;
    const shortest = currentService.packages[0];
    return shortest ? perMonth(shortest.amount, shortest.months) : null;
  }, [currentService]);

  const lastSeenCodeRef = useRef<string | null>(null);
  const lastSeenErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.ok && state.result && state.result.code !== lastSeenCodeRef.current) {
      lastSeenCodeRef.current = state.result.code;
      onCreated(state.result);
      setSelectedPackage(null);
      setNote("");
    } else if (state.error && state.error !== lastSeenErrorRef.current) {
      lastSeenErrorRef.current = state.error;
      toast.error(state.error);
    }
  }, [state, onCreated]);

  const canSubmit = !!selectedPackage && customer.trim().length > 0 && !pending;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      {selectedPackage ? (
        <>
          <input type="hidden" name="packageId" value={selectedPackage.packageId} />
          <input type="hidden" name="amount" value={Math.round(selectedPackage.amount)} />
        </>
      ) : null}
      {partnerId ? <input type="hidden" name="partnerId" value={partnerId} /> : null}

      <div className="flex flex-col gap-5">
        <StepCard
          step={1}
          title="Chọn gói dịch vụ"
          description="Gói hội viên theo thời hạn hoặc khóa học FireAnt Academy."
        >
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không tải được danh sách gói. Vui lòng tải lại trang.</p>
          ) : (
            <>
              {/* Tier switch */}
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Hạng dịch vụ">
                {services.map((s) => {
                  const meta = tierMeta(s.serviceId);
                  const active = selectedServiceId === s.serviceId;
                  return (
                    <button
                      key={s.serviceId}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setSelectedServiceId(s.serviceId);
                        setSelectedPackage(null);
                      }}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
                        active
                          ? "border-foreground bg-foreground text-background shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                      )}
                    >
                      <span className={cn("size-2 rounded-full", meta.dot)} />
                      {s.serviceName}
                      <span className={cn("text-xs", active ? "text-background/70" : "text-muted-foreground/70")}>
                        {s.packages.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Packages */}
              {currentService ? (
                <div
                  role="radiogroup"
                  className={cn(
                    "grid gap-3",
                    isCourse ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
                  )}
                >
                  {currentService.packages.map((pkg) => {
                    const active = selectedPackage?.packageId === pkg.packageId;
                    const meta = tierMeta(pkg.serviceId);
                    const monthly = perMonth(pkg.amount, pkg.months);
                    const saving =
                      baseMonthly && pkg.months > 1 && monthly < baseMonthly
                        ? Math.round((1 - monthly / baseMonthly) * 100)
                        : 0;
                    return (
                      <ChoiceCard
                        key={pkg.packageId}
                        active={active}
                        onSelect={() => setSelectedPackage(pkg)}
                        accentClass={meta.active}
                        className="p-4"
                      >
                        {pkg.isCourse ? (
                          <div className="flex flex-col gap-2 pr-6">
                            <span className="line-clamp-2 text-sm font-semibold leading-snug">
                              {pkg.packageName ?? `Khóa học #${pkg.packageId}`}
                            </span>
                            <span className="num text-base font-bold">{formatVND(pkg.amount)}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-5">
                              <span className="whitespace-nowrap text-sm font-semibold">{durationLabel(pkg.months)}</span>
                              {saving > 0 ? (
                                <span className="rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                                  −{saving}%
                                </span>
                              ) : null}
                            </div>
                            <div className="flex flex-col">
                              <span className="num text-base font-bold leading-tight">{formatVND(pkg.amount)}</span>
                              <span className="num text-[11px] text-muted-foreground">
                                ≈ {formatVND(Math.round(monthly))}/tháng
                              </span>
                            </div>
                          </div>
                        )}
                      </ChoiceCard>
                    );
                  })}
                </div>
              ) : null}
              {state.fieldErrors?.packageId ? (
                <p className="text-xs text-destructive">{state.fieldErrors.packageId[0]}</p>
              ) : null}
            </>
          )}
        </StepCard>

        <StepCard
          step={2}
          title="Thông tin khách hàng"
          description="Link gắn với tài khoản FireAnt của khách để kích hoạt đúng người."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="customerEmail">
                Tài khoản FireAnt <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <UserRoundIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="customerEmail"
                  name="customerEmail"
                  type="text"
                  autoComplete="off"
                  placeholder="username hoặc email đăng nhập"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  aria-invalid={!!state.fieldErrors?.customerEmail}
                  className="h-9 pl-9"
                  required
                />
              </div>
              {state.fieldErrors?.customerEmail ? (
                <p className="text-xs text-destructive">{state.fieldErrors.customerEmail[0]}</p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Khách chưa có tài khoản vẫn tạo được link — đăng ký bằng đúng username/email này để được kích hoạt.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="note">
                Ghi chú <span className="text-xs font-normal text-muted-foreground">(tuỳ chọn)</span>
              </Label>
              <Input
                id="note"
                name="note"
                placeholder="VD: Khuyến mãi 30/4, khách giới thiệu…"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">Chỉ hiển thị nội bộ, khách không thấy.</p>
            </div>
          </div>
        </StepCard>
      </div>

      {/* Summary */}
      <SummaryCard
        title="Tóm tắt đơn"
        footer={
          <span>
            Link có hiệu lực <strong className="font-semibold text-foreground">14 ngày</strong>. Hệ thống tạo đơn
            hàng chờ + QR chuyển khoản định danh ngay khi bạn bấm tạo.
          </span>
        }
      >
        {selectedPackage ? (
          <>
            <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <TierBadge serviceId={selectedPackage.serviceId} />
                {!selectedPackage.isCourse ? (
                  <span className="text-xs text-muted-foreground">{durationLabel(selectedPackage.months)}</span>
                ) : null}
              </div>
              <span className="text-sm font-semibold leading-snug">
                {selectedPackage.isCourse
                  ? selectedPackage.packageName ?? `Khóa học #${selectedPackage.packageId}`
                  : `Hội viên ${selectedPackage.serviceName}`}
              </span>
              <span className="num text-2xl font-bold tracking-tight text-primary">
                {formatVND(selectedPackage.amount)}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <SummaryRow label="Khách hàng" muted={!customer.trim()}>
                <span className="block max-w-[180px] truncate">{customer.trim() || "Chưa nhập"}</span>
              </SummaryRow>
              <SummaryRow label="Thanh toán">Chuyển khoản / QR</SummaryRow>
              {note.trim() ? (
                <SummaryRow label="Ghi chú">
                  <span className="block max-w-[180px] truncate">{note.trim()}</span>
                </SummaryRow>
              ) : null}
            </div>
          </>
        ) : (
          <SummaryEmpty>Chọn một gói ở bước 1 để xem tóm tắt.</SummaryEmpty>
        )}

        <Button type="submit" disabled={!canSubmit} className="h-10 w-full gap-2 text-sm">
          <LinkIcon className="size-4" />
          {pending ? "Đang tạo link…" : "Tạo link & mã QR"}
        </Button>
      </SummaryCard>
    </form>
  );
}
