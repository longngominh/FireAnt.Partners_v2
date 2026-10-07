"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCardIcon, GlobeIcon, LinkIcon, QrCodeIcon, UserRoundIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND } from "@/lib/utils/currency";
import { createPaymentAction } from "@/lib/payment/actions";
import {
  createPaymentInitialState,
  type CreatePaymentResult,
  type CreatePaymentState,
  type VoucherPreview,
} from "@/lib/payment/types";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_META,
  isCardPayment,
  type PaymentMethod,
} from "@/lib/payment/payment-method";
import { normalizeVnPhone } from "@/lib/payment/phone";
import { normalizeSource } from "@/lib/payment/source";
import { durationLabel, tierMeta } from "@/lib/payment/tiers";
import type { ServicePackage } from "@/lib/data/packages";
import { cn } from "@/lib/utils";
import {
  Callout,
  ChoiceCard,
  StepCard,
  SummaryCard,
  SummaryEmpty,
  SummaryRow,
  TierBadge,
  perMonth,
} from "./form-bits";
import { CreateAccountDialog, type CreatedAccount } from "./create-account-dialog";
import { CustomerLookupStatus, CustomerPhoneField } from "./customer-fields";
import { SourceField } from "./source-field";
import { useCustomerLookup } from "./use-customer-lookup";
import { VoucherField, isCurrentPreview } from "./voucher-field";

type Props = {
  packages: ServicePackage[];
  /** Admin tạo thay cho đối tác; partner thường để null (lấy từ phiên) */
  partnerId: string | null;
  onCreated: (result: CreatePaymentResult) => void;
  sourceSuggestions: string[];
};

type ServiceGroup = {
  serviceId: number;
  serviceName: string;
  isCourse: boolean;
  packages: ServicePackage[];
};

const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  bank: QrCodeIcon,
  "domestic-card": CreditCardIcon,
  "intl-card": GlobeIcon,
};

export function PurchaseForm({ packages, partnerId, onCreated, sourceSuggestions }: Props) {
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
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const { lookup, checking, refresh: refreshLookup, setLookup } = useCustomerLookup(customer);
  // Đổi key mỗi lần mở để dialog lấy lại email/số mới nhất làm giá trị mặc định.
  const [accountDialog, setAccountDialog] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherPreview, setVoucherPreview] = useState<VoucherPreview | null>(null);
  // Kết quả "Áp dụng" lúc bấm tạo link — server bác mã (vừa hết lượt, hết hạn…) thì lỗi chỉ
  // gắn với đúng kết quả đó, áp dụng lại là hết.
  const [submittedVoucher, setSubmittedVoucher] = useState<VoucherPreview | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank");
  const payByCard = isCardPayment(paymentMethod);

  const currentService = services.find((s) => s.serviceId === selectedServiceId) ?? null;
  const isCourse = currentService?.isCourse ?? false;

  const rejectedOnSubmit =
    !pending && voucherPreview !== null && submittedVoucher === voucherPreview
      ? (state.fieldErrors?.voucherCode?.[0] ?? null)
      : null;
  const effectivePreview: VoucherPreview | null =
    rejectedOnSubmit && voucherPreview
      ? {
          ok: false,
          code: voucherPreview.code,
          packageId: voucherPreview.packageId,
          customer: voucherPreview.customer,
          error: rejectedOnSubmit,
          field: "voucherCode",
        }
      : voucherPreview;

  // Mã chỉ được gửi lên khi kết quả "Áp dụng" còn khớp mã + gói + khách đang nhập. Thanh toán
  // thẻ bỏ qua mã (cổng thẻ thu giá gói); mã vẫn giữ trong ô để chọn lại chuyển khoản là dùng được.
  const currentVoucher =
    !payByCard && isCurrentPreview(effectivePreview, voucherCode, selectedPackage?.packageId ?? null, customer)
      ? effectivePreview
      : null;
  const appliedVoucher = currentVoucher?.ok ? currentVoucher : null;
  const voucherUnchecked = !payByCard && voucherCode.trim() !== "" && !appliedVoucher;
  const finalAmount = appliedVoucher ? appliedVoucher.finalAmount : (selectedPackage?.amount ?? 0);
  const sourceLabel = normalizeSource(source);

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
      // Mã khuyến mại thường dùng cho một đơn; nguồn giữ lại vì hay tạo nhiều link cùng kênh.
      setVoucherCode("");
      setVoucherPreview(null);
      // Thẻ là theo yêu cầu riêng của từng khách — link sau quay về chuyển khoản.
      setPaymentMethod("bank");
    } else if (state.error && state.error !== lastSeenErrorRef.current) {
      lastSeenErrorRef.current = state.error;
      toast.error(state.error);
    }
  }, [state, onCreated]);

  // Số điện thoại bắt buộc (gói hội viên & khóa học): tài khoản đã có số thì dùng số đó.
  const accountHasPhone = lookup?.status === "account" && lookup.hasPhone;
  const phoneReady = accountHasPhone || !!normalizeVnPhone(customerPhone);
  const customerReady = lookup?.status === "account" || lookup?.status === "new-email";

  const canSubmit =
    !!selectedPackage && customerReady && phoneReady && !voucherUnchecked && !pending;

  // Lý do nút tạo link còn khoá (theo thứ tự CTV điền form).
  const submitHint = !customer.trim()
    ? "Nhập tài khoản khách ở bước 2 để tạo link."
    : checking
      ? null
      : !customerReady
        ? "Kiểm tra lại tài khoản khách ở bước 2."
        : !phoneReady
          ? "Nhập số điện thoại của khách ở bước 2."
          : voucherUnchecked
            ? "Áp dụng hoặc bỏ mã khuyến mại để tạo link."
            : null;

  function openAccountDialog() {
    setAccountDialog((d) => ({ open: true, key: d.key + 1 }));
  }

  function handleAccountCreated(account: CreatedAccount, phone: string) {
    // Ô tài khoản chuyển sang tài khoản vừa tạo, không phải chờ tra lại. Số vừa nhập điền
    // sẵn ở bước 2 — dùng tới khi chưa ghi được số vào tài khoản.
    setCustomer(account.userName);
    setCustomerPhone(phone);
    setLookup({
      status: "account",
      input: account.userName,
      userName: account.userName,
      hasPhone: account.phoneSaved,
      maskedPhone: account.phoneSaved ? account.maskedPhone : null,
    });
  }

  function handleExistingAccount(userName: string) {
    setCustomer(userName);
    refreshLookup();
  }

  return (
    <form
      action={action}
      onSubmit={() => setSubmittedVoucher(voucherPreview)}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"
    >
      {selectedPackage ? (
        <>
          <input type="hidden" name="packageId" value={selectedPackage.packageId} />
          <input type="hidden" name="amount" value={Math.round(selectedPackage.amount)} />
        </>
      ) : null}
      {partnerId ? <input type="hidden" name="partnerId" value={partnerId} /> : null}
      {appliedVoucher ? <input type="hidden" name="voucherCode" value={appliedVoucher.code} /> : null}
      <input type="hidden" name="paymentMethod" value={paymentMethod} />

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
          description="Link gắn với tài khoản FireAnt của khách để kích hoạt đúng người. Gói hội viên và khóa học đều cần số điện thoại."
        >
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
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
                  aria-invalid={!!state.fieldErrors?.customerEmail || lookup?.status === "invalid"}
                  className="h-9 pl-9"
                  required
                />
              </div>
              <CustomerLookupStatus
                lookup={lookup}
                checking={checking}
                serverError={state.fieldErrors?.customerEmail?.[0]}
                onCreateAccount={openAccountDialog}
                onRetry={refreshLookup}
              />
            </div>

            <CustomerPhoneField
              id="customerPhone"
              lookup={lookup}
              value={customerPhone}
              onChange={setCustomerPhone}
              serverError={state.fieldErrors?.customerPhone?.[0]}
            />

            <SourceField
              id="source"
              value={source}
              onChange={setSource}
              suggestions={sourceSuggestions}
              error={state.fieldErrors?.source?.[0]}
            />

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

        <StepCard
          step={3}
          title="Phương thức thanh toán"
          description="Link mở đúng phương thức đã chọn. Khách muốn trả bằng thẻ tín dụng thì chọn Thẻ quốc tế."
        >
          <div role="radiogroup" aria-label="Phương thức thanh toán" className="grid gap-3 sm:grid-cols-3">
            {PAYMENT_METHODS.map((method) => {
              const meta = PAYMENT_METHOD_META[method];
              const Icon = METHOD_ICONS[method];
              return (
                <ChoiceCard
                  key={method}
                  active={paymentMethod === method}
                  onSelect={() => setPaymentMethod(method)}
                  className="p-4"
                >
                  <div className="flex flex-col gap-2 pr-6">
                    <Icon className="size-5 text-muted-foreground" />
                    <div className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                        {meta.label}
                        {method === "bank" ? (
                          <span className="rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                            Nên dùng
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">{meta.detail}</span>
                    </div>
                  </div>
                </ChoiceCard>
              );
            })}
          </div>
          {payByCard ? (
            <Callout
              title="Khách nhập thẻ trên cổng thanh toán OnePay"
              detail="Đơn hàng được tạo khi khách mở link, gói kích hoạt tự động khi thanh toán thành công. Link thẻ không có QR chuyển khoản và không áp dụng mã khuyến mại."
            />
          ) : null}
        </StepCard>
      </div>

      {/* Summary */}
      <SummaryCard
        title="Tóm tắt đơn"
        footer={
          payByCard ? (
            <span>
              Link có hiệu lực <strong className="font-semibold text-foreground">14 ngày</strong>. Khách mở link sẽ
              được chuyển sang cổng OnePay để thanh toán bằng thẻ.
            </span>
          ) : (
            <span>
              Link có hiệu lực <strong className="font-semibold text-foreground">14 ngày</strong>. Hệ thống tạo đơn
              hàng chờ + QR chuyển khoản định danh ngay khi bạn bấm tạo.
            </span>
          )
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
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="num text-2xl font-bold tracking-tight text-primary">{formatVND(finalAmount)}</span>
                {appliedVoucher && appliedVoucher.discountAmount > 0 ? (
                  <span className="num text-sm text-muted-foreground line-through">
                    {formatVND(selectedPackage.amount)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <SummaryRow label="Khách hàng" muted={!customer.trim()}>
                <span className="block max-w-[180px] truncate">
                  {lookup?.status === "account" ? lookup.userName : customer.trim() || "Chưa nhập"}
                </span>
              </SummaryRow>
              <SummaryRow label="Số điện thoại" muted={!phoneReady}>
                <span className="num block max-w-[180px] truncate">
                  {accountHasPhone ? lookup.maskedPhone : normalizeVnPhone(customerPhone) ?? "Chưa nhập"}
                </span>
              </SummaryRow>
              {sourceLabel ? (
                <SummaryRow label="Nguồn">
                  <span className="block max-w-[180px] truncate">{sourceLabel}</span>
                </SummaryRow>
              ) : null}
              <SummaryRow label="Thanh toán">{PAYMENT_METHOD_META[paymentMethod].label}</SummaryRow>
              {appliedVoucher ? (
                <SummaryRow label="Mã khuyến mại">
                  <span className="flex flex-col items-end">
                    <code className="font-mono text-xs font-semibold">{appliedVoucher.code}</code>
                    <span className="num text-xs font-medium text-success">
                      {appliedVoucher.discountAmount > 0
                        ? `−${formatVND(appliedVoucher.discountAmount)}`
                        : appliedVoucher.benefit}
                    </span>
                  </span>
                </SummaryRow>
              ) : null}
              {note.trim() ? (
                <SummaryRow label="Ghi chú">
                  <span className="block max-w-[180px] truncate">{note.trim()}</span>
                </SummaryRow>
              ) : null}
            </div>
            <div className="border-t pt-4">
              {payByCard ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Mã khuyến mại</span> chỉ áp dụng khi khách chuyển
                  khoản / QR — cổng thẻ thu đúng giá gói.
                  {voucherCode ? ` Chọn lại Chuyển khoản / QR để dùng mã ${voucherCode}.` : null}
                </p>
              ) : (
                <VoucherField
                  code={voucherCode}
                  onCodeChange={setVoucherCode}
                  preview={effectivePreview}
                  onPreviewChange={setVoucherPreview}
                  packageId={selectedPackage.packageId}
                  customer={customer}
                />
              )}
            </div>
          </>
        ) : (
          <SummaryEmpty>Chọn một gói ở bước 1 để xem tóm tắt.</SummaryEmpty>
        )}

        <Button type="submit" disabled={!canSubmit} className="h-10 w-full gap-2 text-sm">
          {payByCard ? <CreditCardIcon className="size-4" /> : <LinkIcon className="size-4" />}
          {pending ? "Đang tạo link…" : payByCard ? "Tạo link thanh toán thẻ" : "Tạo link & mã QR"}
        </Button>
        {submitHint && selectedPackage && !pending ? (
          <p className="-mt-2 text-center text-xs text-muted-foreground">{submitHint}</p>
        ) : null}
      </SummaryCard>

      <CreateAccountDialog
        key={accountDialog.key}
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog((d) => ({ ...d, open }))}
        defaultEmail={lookup?.status === "new-email" ? lookup.email : customer.trim()}
        defaultPhone={customerPhone}
        onCreated={handleAccountCreated}
        onExisting={handleExistingAccount}
      />
    </form>
  );
}
