import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { formatVND } from "@/lib/utils/currency";
import { RECEIVING_BANK, tierMeta } from "@/lib/payment/tiers";
import { cn } from "@/lib/utils";
import { PublicShell } from "./public-notice";
import { CopyValueButton } from "./copy-value-button";
import { UpgradeStatusPoller } from "./upgrade-status-poller";

export type UpgradePaymentViewModel = {
  code: string;
  state: "pending" | "paid" | "expired" | "unavailable";
  amount: number;
  orderId: number | null;
  accountNumber: string;
  transferContent: string;
  qrCodeUrl: string;
  qrPending: boolean;
  isMock: boolean;
  userName: string;
  packageName: string | null;
  mode: "keep" | "trade";
  expectedEndDate: string | null;
  paidEndDate: string | null;
  currentServiceId: number | null;
  expiresAt: string;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy", { locale: vi });
}

function TierChip({ serviceId }: { serviceId: number }) {
  const meta = tierMeta(serviceId);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", meta.badge)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function guessTargetServiceId(packageName: string | null, currentServiceId: number | null): number | null {
  const name = (packageName ?? "").toLowerCase();
  if (name.includes("premium") || name.includes("cao cấp") || name.includes("cao cap")) return 35;
  if (name.includes("pro") || name.includes("chuyên nghiệp") || name.includes("chuyen nghiep")) return 34;
  if (currentServiceId === 34) return 35;
  return null;
}

export function UpgradePaymentView({ view }: { view: UpgradePaymentViewModel }) {
  const targetServiceId = guessTargetServiceId(view.packageName, view.currentServiceId);

  if (view.state === "paid") {
    return (
      <PublicShell>
        <div className="rounded-2xl border bg-card p-8 shadow-xl shadow-black/5">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/15">
            <CheckIcon className="size-7 text-success" />
          </div>
          <h1 className="mt-4 text-center text-xl font-semibold tracking-tight">Nâng cấp thành công!</h1>
          <p className="mx-auto mt-1 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            Cảm ơn bạn đã tin tưởng FireAnt. Mọi tính năng của gói mới đã sẵn sàng trên tài khoản{" "}
            <span className="font-medium text-foreground">{view.userName}</span>.
          </p>

          <dl className="mx-auto mt-6 max-w-md divide-y rounded-xl border text-sm">
            <Row label="Gói hội viên">
              {targetServiceId ? <TierChip serviceId={targetServiceId} /> : view.packageName ?? "—"}
            </Row>
            {view.paidEndDate ? (
              <Row label="Sử dụng đến hết">
                <span className="num font-semibold">{fmtDate(view.paidEndDate)}</span>
              </Row>
            ) : null}
            <Row label="Đã thanh toán">
              <span className="num font-semibold text-success">{formatVND(view.amount)}</span>
            </Row>
            {view.orderId ? (
              <Row label="Mã đơn hàng">
                <span className="num font-medium">FA{view.orderId}</span>
              </Row>
            ) : null}
          </dl>

          <div className="mt-6 flex justify-center">
            <a
              href="https://fireant.vn"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
            >
              Mở FireAnt
              <ArrowRightIcon className="size-4" />
            </a>
          </div>
        </div>
      </PublicShell>
    );
  }

  if (view.state === "expired") {
    return (
      <PublicShell>
        <div className="rounded-2xl border bg-card p-8 text-center shadow-xl shadow-black/5">
          <h1 className="text-xl font-semibold tracking-tight">Link nâng cấp đã hết hạn</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Giá nâng cấp được tính theo số ngày còn lại của gói nên link chỉ có hiệu lực 14 ngày.
            Vui lòng liên hệ người đã gửi link để nhận báo giá mới.
          </p>
        </div>
      </PublicShell>
    );
  }

  if (view.state === "unavailable") {
    return (
      <PublicShell>
        <div className="rounded-2xl border bg-card p-8 text-center shadow-xl shadow-black/5">
          <h1 className="text-xl font-semibold tracking-tight">Chưa lấy được thông tin thanh toán</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Hệ thống tạm thời chưa tạo được mã QR cho đơn này. Vui lòng tải lại trang sau ít phút hoặc liên hệ hỗ trợ.
          </p>
        </div>
      </PublicShell>
    );
  }

  const modeLabel =
    view.mode === "keep"
      ? "Giữ nguyên hạn sử dụng, chuyển sang hạng cao hơn"
      : "Mua gói mới, trừ giá trị còn lại của gói hiện tại";

  return (
    <PublicShell>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-black/5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/30 px-6 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Số tiền cần chuyển
            </div>
            <div className="num mt-1 text-3xl font-bold tracking-tight text-primary sm:text-4xl">
              {formatVND(view.amount)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Nâng cấp gói hội viên</span>
              {view.currentServiceId ? <TierChip serviceId={view.currentServiceId} /> : null}
              {view.currentServiceId && targetServiceId ? (
                <ArrowRightIcon className="size-3.5 text-muted-foreground/70" />
              ) : null}
              {targetServiceId ? <TierChip serviceId={targetServiceId} /> : null}
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="text-xs text-muted-foreground">Mã đơn hàng</div>
            <div className="num font-semibold">{view.orderId ? `FA${view.orderId}` : "—"}</div>
            <div className="mt-1 max-w-[220px] text-xs text-muted-foreground">{modeLabel}</div>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 items-center gap-6 p-6 md:grid-cols-[auto_1fr]">
          {/* QR — nền trắng bắt buộc để app ngân hàng quét được */}
          <div className="mx-auto flex flex-col items-center gap-2">
            <div className="rounded-2xl bg-white p-3 shadow-lg shadow-black/10 ring-1 ring-black/5">
              {view.qrCodeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={view.qrCodeUrl}
                  alt="Mã QR thanh toán nâng cấp"
                  className="h-auto w-52 sm:w-60"
                />
              ) : (
                <div className="flex size-52 items-center justify-center text-center text-xs text-neutral-500 sm:size-60">
                  {view.qrPending
                    ? "Cổng thanh toán tạm chưa trả QR. Vui lòng chuyển khoản theo thông tin bên cạnh."
                    : "Đang tạo mã QR…"}
                </div>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">Quét bằng app ngân hàng bất kỳ (VietQR)</span>
          </div>

          <dl className="divide-y text-sm">
            <Row label="Ngân hàng">
              <span className="text-right font-medium">
                {RECEIVING_BANK.shortName}
                <span className="hidden text-muted-foreground sm:inline"> — {RECEIVING_BANK.fullName}</span>
              </span>
            </Row>
            <Row label="Số tài khoản">
              <span className="flex items-center gap-1.5">
                <span className="num font-semibold tracking-wide">{view.accountNumber || "—"}</span>
                {view.accountNumber ? <CopyValueButton value={view.accountNumber} label="số tài khoản" /> : null}
              </span>
            </Row>
            <Row label="Người thụ hưởng">
              <span className="font-medium">{RECEIVING_BANK.beneficiary}</span>
            </Row>
            <Row label="Số tiền">
              <span className="flex items-center gap-1.5">
                <span className="num font-semibold">{formatVND(view.amount)}</span>
                <CopyValueButton value={String(Math.round(view.amount))} label="số tiền" />
              </span>
            </Row>
            <Row label="Nội dung">
              <span className="flex items-center gap-1.5">
                <span className="font-medium">{view.transferContent || "—"}</span>
                {view.transferContent ? <CopyValueButton value={view.transferContent} label="nội dung" /> : null}
              </span>
            </Row>
            <Row label="Hạn mới dự kiến">
              <span className="num font-semibold">{fmtDate(view.expectedEndDate)}</span>
            </Row>
          </dl>
        </div>

        {/* Status */}
        <div className="border-t px-6 py-4">
          <UpgradeStatusPoller code={view.code} />
        </div>

        <div className="border-t bg-muted/40 px-6 py-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Chuyển khoản <strong className="font-semibold text-foreground">đúng số tiền</strong> trong hôm nay —
            giá trị quy đổi tính tại thời điểm tạo mã. Không dùng lại số tài khoản này cho giao dịch khác.
            Link có hiệu lực đến {fmtDate(view.expiresAt)}.
          </p>
          {view.isMock ? (
            <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
              Hệ thống đang ở chế độ thử nghiệm (OnePay mock) — QR này không dùng để thanh toán thật.
            </p>
          ) : null}
        </div>
      </div>
    </PublicShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
