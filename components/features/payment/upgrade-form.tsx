"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowRightIcon, ArrowUpCircleIcon, Loader2Icon, SearchIcon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND } from "@/lib/utils/currency";
import { createUpgradePaymentAction, getUpgradeQuoteAction } from "@/lib/payment/actions";
import { createPaymentInitialState, type CreatePaymentResult, type CreatePaymentState } from "@/lib/payment/types";
import { durationLabel, tierMeta } from "@/lib/payment/tiers";
import type { UpgradeOption, UpgradeQuote, UpgradeTier } from "@/lib/data/membership";
import { cn } from "@/lib/utils";
import {
  Callout,
  ChoiceCard,
  RadioDot,
  StepCard,
  SummaryCard,
  SummaryEmpty,
  SummaryRow,
  TierBadge,
} from "./form-bits";

type Props = {
  partnerId: string | null;
  onCreated: (result: CreatePaymentResult) => void;
  onSuggestPurchase: () => void;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy", { locale: vi });
}

function pickDefaultOption(tier: UpgradeTier | undefined): string | null {
  if (!tier) return null;
  const keep = tier.options.find((o) => o.kind === "keep" && o.available);
  if (keep) return keep.key;
  return tier.options.find((o) => o.available)?.key ?? null;
}

export function UpgradeForm({ partnerId, onCreated, onSuggestPurchase }: Props) {
  const [state, action, pending] = useActionState<CreatePaymentState, FormData>(
    createUpgradePaymentAction,
    createPaymentInitialState,
  );

  const [account, setAccount] = useState("");
  const [quote, setQuote] = useState<UpgradeQuote | null>(null);
  const [checking, startChecking] = useTransition();
  const [checkedAccount, setCheckedAccount] = useState<string>("");

  const [tierId, setTierId] = useState<number | null>(null);
  const [optionKey, setOptionKey] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const eligible = quote?.eligible ? quote : null;
  const tier = eligible?.tiers.find((t) => t.serviceId === tierId) ?? eligible?.tiers[0] ?? null;
  const option: UpgradeOption | null = tier?.options.find((o) => o.key === optionKey && o.available) ?? null;

  function check() {
    const value = account.trim();
    if (!value) {
      toast.error("Nhập tài khoản FireAnt của khách trước.");
      return;
    }
    startChecking(async () => {
      const q = await getUpgradeQuoteAction(value);
      setQuote(q);
      setCheckedAccount(value);
      if (q.eligible) {
        const first = q.tiers[0];
        setTierId(first?.serviceId ?? null);
        setOptionKey(pickDefaultOption(first));
      } else {
        setTierId(null);
        setOptionKey(null);
      }
    });
  }

  function selectTier(serviceId: number) {
    setTierId(serviceId);
    setOptionKey(pickDefaultOption(eligible?.tiers.find((t) => t.serviceId === serviceId)));
  }

  const lastSeenCodeRef = useRef<string | null>(null);
  const lastSeenErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.ok && state.result && state.result.code !== lastSeenCodeRef.current) {
      lastSeenCodeRef.current = state.result.code;
      onCreated(state.result);
      // Báo giá đã dùng — buộc tra cứu lại trước khi tạo link tiếp
      setQuote(null);
      setTierId(null);
      setOptionKey(null);
      setNote("");
    } else if (state.error && state.error !== lastSeenErrorRef.current) {
      lastSeenErrorRef.current = state.error;
      toast.error(state.error);
    }
  }, [state, onCreated]);

  const accountChanged = account.trim() !== checkedAccount;
  const canSubmit = !!eligible && !!tier && !!option && !pending && !checking && !accountChanged;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      {eligible && tier && option ? (
        <>
          <input type="hidden" name="customerEmail" value={eligible.userName} />
          <input type="hidden" name="tierServiceId" value={tier.serviceId} />
          <input type="hidden" name="option" value={option.key} />
        </>
      ) : null}
      {partnerId ? <input type="hidden" name="partnerId" value={partnerId} /> : null}

      <div className="flex flex-col gap-5">
        <StepCard
          step={1}
          title="Tài khoản khách hàng"
          description="Hệ thống đọc gói hiện tại của khách và tính giá trị còn lại để trừ vào gói mới."
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="upgradeAccount">
              Tài khoản FireAnt <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <UserRoundIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="upgradeAccount"
                  type="text"
                  autoComplete="off"
                  placeholder="username hoặc email đăng nhập"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      check();
                    }
                  }}
                  className="h-9 pl-9"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={check}
                disabled={checking || !account.trim()}
                className="h-9 gap-2 px-4"
              >
                {checking ? <Loader2Icon className="size-4 animate-spin" /> : <SearchIcon className="size-4" />}
                Kiểm tra
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Chỉ áp dụng cho khách đang có gói <strong className="font-medium text-foreground">Thiết yếu</strong> hoặc{" "}
              <strong className="font-medium text-foreground">Chuyên nghiệp</strong> còn thời hạn.
            </p>
          </div>

          {quote && !quote.eligible ? (
            <Callout
              tone="warning"
              title={quote.title}
              detail={quote.detail}
              action={
                quote.suggestPurchase ? (
                  <Button type="button" variant="outline" size="sm" onClick={onSuggestPurchase}>
                    Tạo link mua gói mới
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {eligible ? (
            <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Gói hiện tại · {eligible.userName}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">Hội viên {eligible.current.name}</span>
                  <TierBadge serviceId={eligible.current.serviceId} showTag />
                </div>
                <span className="num text-sm text-muted-foreground">
                  Hết hạn {fmtDate(eligible.current.endDate)} · còn{" "}
                  <strong className="font-semibold text-foreground">{eligible.current.dayLeft} ngày</strong>
                  {eligible.current.packageName ? (
                    <span className="hidden sm:inline"> · {eligible.current.packageName}</span>
                  ) : null}
                </span>
              </div>
              <div className="rounded-lg border border-success/25 bg-success/8 px-4 py-3 sm:text-right">
                <div className="text-xs font-medium text-success">Giá trị còn lại quy đổi</div>
                <div className="num mt-0.5 text-xl font-bold tracking-tight text-success">
                  ≈ {formatVND(eligible.amountLeft)}
                </div>
                <div className="text-[11px] text-muted-foreground">được trừ thẳng vào giá gói mới</div>
              </div>
            </div>
          ) : null}
        </StepCard>

        {eligible && tier ? (
          <StepCard
            step={2}
            title="Phương án nâng cấp"
            description="Giá quy đổi theo đơn giá ngày, làm tròn lên 1.000 ₫ — phần dư quy thành ngày sử dụng cho khách."
            aside={
              eligible.tiers.length > 1 ? (
                <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="tablist" aria-label="Hạng đích">
                  {eligible.tiers.map((t) => {
                    const active = t.serviceId === tier.serviceId;
                    const meta = tierMeta(t.serviceId);
                    return (
                      <button
                        key={t.serviceId}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => selectTier(t.serviceId)}
                        className={cn(
                          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                          active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", meta.dot)} />
                        Lên {t.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <TierBadge serviceId={tier.serviceId} size="md" showTag />
              )
            }
          >
            <div role="radiogroup" className="flex flex-col gap-2.5">
              {tier.options.map((o) => {
                const active = option?.key === o.key;
                const title =
                  o.kind === "keep"
                    ? "Giữ nguyên hạn sử dụng"
                    : `Gói ${durationLabel(o.months)} từ hôm nay`;
                const desc =
                  o.kind === "keep"
                    ? `Chuyển sang ${tier.name} cho ${eligible.current.dayLeft} ngày còn lại — dùng đến hết ${fmtDate(o.endDate)}`
                    : o.available
                      ? `Giá gói ${formatVND(o.listAmount)} − giá trị còn lại — dùng đến hết ${fmtDate(o.endDate)}`
                      : "Giá trị còn lại của khách cao hơn giá gói này — chọn gói dài hơn.";
                return (
                  <ChoiceCard
                    key={o.key}
                    active={active}
                    disabled={!o.available}
                    onSelect={() => setOptionKey(o.key)}
                    className="px-4 py-3.5"
                  >
                    <div className="flex items-center gap-3.5">
                      <RadioDot active={active} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{title}</span>
                          {o.badge === "popular" ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              Phổ biến
                            </span>
                          ) : null}
                          {o.badge === "best" ? (
                            <span className="rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold text-success">
                              Đơn giá tốt nhất
                            </span>
                          ) : null}
                        </div>
                        <p className="num mt-0.5 text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <div className="num shrink-0 pr-5 text-right text-base font-bold tracking-tight">
                        {o.available ? formatVND(o.price) : "—"}
                      </div>
                    </div>
                  </ChoiceCard>
                );
              })}
            </div>
            {state.fieldErrors?.option ? (
              <p className="text-xs text-destructive">{state.fieldErrors.option[0]}</p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="upgradeNote">
                Ghi chú <span className="text-xs font-normal text-muted-foreground">(tuỳ chọn, nội bộ)</span>
              </Label>
              <Input
                id="upgradeNote"
                name="note"
                placeholder="VD: Khách yêu cầu nâng cấp qua Zalo…"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-9"
              />
            </div>
          </StepCard>
        ) : null}
      </div>

      {/* Summary */}
      <SummaryCard
        title="Tóm tắt nâng cấp"
        footer={
          <span>
            Khách chuyển <strong className="font-semibold text-foreground">đúng số tiền</strong> qua QR — gói được
            nâng cấp tự động 24/7. Link có hiệu lực 14 ngày.
          </span>
        }
      >
        {eligible && tier && option ? (
          <>
            <div className="flex flex-col gap-2.5 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-1.5">
                <TierBadge serviceId={eligible.current.serviceId} />
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                <TierBadge serviceId={tier.serviceId} />
              </div>
              <span className="text-sm font-semibold leading-snug">
                {option.kind === "keep"
                  ? `Giữ nguyên hạn, chuyển sang ${tier.name}`
                  : `Gói ${durationLabel(option.months)} ${tier.name} từ hôm nay`}
              </span>
              <span className="num text-2xl font-bold tracking-tight text-primary">{formatVND(option.price)}</span>
            </div>
            <div className="flex flex-col gap-2">
              <SummaryRow label="Khách hàng">
                <span className="block max-w-[180px] truncate">{eligible.userName}</span>
              </SummaryRow>
              <SummaryRow label="Hạn mới dự kiến">
                <span className="num">{fmtDate(option.endDate)}</span>
              </SummaryRow>
              <SummaryRow label="Đã trừ giá trị còn lại">
                <span className="num text-success">−{formatVND(eligible.amountLeft)}</span>
              </SummaryRow>
            </div>
            {accountChanged ? (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                Tài khoản đã thay đổi — bấm <strong className="font-semibold">Kiểm tra</strong> lại trước khi tạo link.
              </p>
            ) : null}
          </>
        ) : (
          <SummaryEmpty>
            {checking
              ? "Đang tra cứu gói hiện tại của khách…"
              : "Nhập tài khoản khách và bấm Kiểm tra để xem báo giá nâng cấp."}
          </SummaryEmpty>
        )}

        <Button type="submit" disabled={!canSubmit} className="h-10 w-full gap-2 text-sm">
          <ArrowUpCircleIcon className="size-4" />
          {pending ? "Đang tạo link…" : "Tạo link nâng cấp & QR"}
        </Button>
      </SummaryCard>
    </form>
  );
}
