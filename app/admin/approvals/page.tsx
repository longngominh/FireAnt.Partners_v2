import Link from "next/link";
import { format } from "date-fns";
import { CheckIcon, InfoIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { ApplicationDecision } from "@/components/features/admin/application-decision";
import { requireAdminSession } from "@/lib/auth/session";
import { contractTierTitle } from "@/lib/commission";
import { getContractsForMonth } from "@/lib/data/contracts";
import { getPartnerPaymentInfoMap } from "@/lib/data/partner-payment-info";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  checkStaffAccount,
  countActiveStaffByPartner,
  countStaffApplicationsByStatus,
  isContractHolderAccount,
  listStaffApplications,
  type ApplicationStatus,
  type StaffAccountCheck,
  type StaffApplication,
} from "@/lib/data/staff";
import { hasStaffModel, STAFF_MIGRATION_HINT } from "@/lib/data/staff-model";
import { staffAccountProblem } from "@/lib/staff/service";
import { cn } from "@/lib/utils";
import { currentMonthKey, formatDay } from "@/lib/utils/month";

export const metadata = { title: "Duyệt nhân viên" };

type CheckKind = "ok" | "warn" | "bad";
type Check = { kind: CheckKind; text: string };

const CHECK_STYLES: Record<CheckKind, { row: string; icon: string; chip: string }> = {
  ok: { row: "border-border", icon: "bg-success text-success-foreground", chip: "border-success/30 bg-success/10 text-success" },
  warn: { row: "border-warning/30 bg-warning/10", icon: "bg-warning text-warning-foreground", chip: "border-warning/30 bg-warning/10 text-warning" },
  bad: { row: "border-destructive/30 bg-destructive/10", icon: "bg-destructive text-white", chip: "border-destructive/30 bg-destructive/10 text-destructive" },
};

const CHECK_LABELS: Record<CheckKind, string> = { ok: "Đạt", warn: "Lưu ý", bad: "Chặn duyệt" };
const CHECK_ICONS: Record<CheckKind, typeof CheckIcon> = { ok: CheckIcon, warn: TriangleAlertIcon, bad: XIcon };

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toLocaleUpperCase("vi") ?? "")
    .join("");
}

/** Kiểm tra tự động — cùng điều kiện approveStaffApplication sẽ chặn (staffAccountProblem). */
function reviewChecks(app: StaffApplication, check: StaffAccountCheck): Check[] {
  const checks: Check[] = [];
  if (!check.exists) {
    checks.push({ kind: "bad", text: "Không tìm thấy tài khoản FireAnt với email này" });
    checks.push({ kind: "warn", text: "Chưa có tài khoản nên chưa xác thực được" });
  } else {
    checks.push({
      kind: "ok",
      text: check.createdAt ? `Tài khoản FireAnt tồn tại, đăng ký ${formatDay(check.createdAt)}` : "Tài khoản FireAnt tồn tại",
    });
    checks.push(
      check.verified
        ? { kind: "ok", text: "Tài khoản FireAnt đã xác thực" }
        : { kind: "bad", text: "Tài khoản FireAnt chưa xác thực" },
    );
  }

  if (check.activePartnerId === app.partnerId) {
    checks.push({ kind: "bad", text: "Đã là nhân viên của đối tác này" });
  } else if (check.activePartnerId !== null) {
    checks.push({ kind: "bad", text: `Đang là nhân viên của đối tác ${check.activePartnerName ?? "khác"}` });
  } else {
    checks.push({ kind: "ok", text: "Chưa thuộc đối tác nào" });
  }

  if (check.existingPartnerId === app.partnerId) {
    checks.push({ kind: "bad", text: "Đây là tài khoản của chính đối tác" });
  } else if (isContractHolderAccount(check)) {
    checks.push({ kind: "bad", text: "Tài khoản đang là đối tác có hợp đồng riêng với FireAnt" });
  } else {
    checks.push({ kind: "ok", text: "Không phải đối tác có hợp đồng riêng với FireAnt" });
  }
  return checks;
}

function isStatus(value: unknown): value is ApplicationStatus {
  return APPLICATION_STATUSES.includes(value as ApplicationStatus);
}

const HEADER = (
  <PageHeader
    title="Duyệt nhân viên"
    description="Đề xuất của đối tác cho nhân viên bán hàng của họ. Nhân viên không ký hợp đồng với FireAnt; sau khi duyệt, doanh số qua link của nhân viên được cộng vào doanh thu của đối tác từ lúc duyệt."
  />
);

export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; id?: string }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const status: ApplicationStatus = isStatus(params.status) ? params.status : "pending";

  if (!(await hasStaffModel())) {
    return (
      <div className="flex flex-col gap-6">
        {HEADER}
        <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-6">
          <InfoIcon className="mt-0.5 size-5 shrink-0 text-warning" />
          {STAFF_MIGRATION_HINT}
        </div>
      </div>
    );
  }

  const [applications, counts, contracts, staffCounts, paymentInfo] = await Promise.all([
    listStaffApplications({ status, limit: status === "pending" ? 100 : 200 }),
    countStaffApplicationsByStatus(),
    getContractsForMonth(currentMonthKey()),
    countActiveStaffByPartner(),
    getPartnerPaymentInfoMap(),
  ]);

  const partnerPolicy = (partnerId: number) => {
    const company = paymentInfo.get(partnerId)?.legalType === "company";
    const tier = contracts.get(partnerId)?.tier ?? "normal";
    return `${company ? "Pháp nhân · " : ""}${contractTierTitle(tier)} · ${staffCounts.get(partnerId) ?? 0} nhân viên`;
  };

  const tabs = (
    <nav aria-label="Trạng thái đề xuất" className="flex flex-wrap gap-1.5">
      {APPLICATION_STATUSES.map((s) => (
        <Link
          key={s}
          href={s === "pending" ? "/admin/approvals" : `/admin/approvals?status=${s}`}
          aria-current={s === status ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
            s === status ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {s === "pending" ? "Chờ duyệt" : APPLICATION_STATUS_LABELS[s]}
          <span className="num rounded-full bg-muted px-1.5 text-xs text-foreground">{counts[s]}</span>
        </Link>
      ))}
    </nav>
  );

  if (status !== "pending") {
    return (
      <div className="flex flex-col gap-6">
        {HEADER}
        {tabs}
        <Panel flush title={APPLICATION_STATUS_LABELS[status]} description="200 đề xuất gần nhất">
          {applications.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Chưa có đề xuất nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                    <th className="px-5 py-2.5 font-semibold">Người được đề xuất</th>
                    <th className="px-3 py-2.5 font-semibold">Đối tác đề xuất</th>
                    <th className="px-3 py-2.5 font-semibold">Ngày gửi</th>
                    <th className="px-3 py-2.5 font-semibold">Xử lý</th>
                    <th className="px-5 py-2.5 font-semibold">{status === "rejected" ? "Lý do" : "Ghi chú"}</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id} className="border-b align-top last:border-b-0">
                      <td className="px-5 py-3">
                        <span className="flex flex-col">
                          <span className="font-semibold">{app.fullName ?? app.userName}</span>
                          <span className="text-xs text-muted-foreground">{app.userName}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/partners/${app.partnerId}${status === "approved" ? "#nhan-vien" : ""}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {app.partnerName}
                        </Link>
                      </td>
                      <td className="num px-3 py-3">{formatDay(app.createdAt)}</td>
                      <td className="px-3 py-3">
                        <span className="flex flex-col">
                          <span className="num">{formatDay(app.reviewedAt)}</span>
                          <span className="text-xs text-muted-foreground">
                            {status === "cancelled" ? "Đối tác hủy" : (app.reviewedBy ?? "—")}
                          </span>
                        </span>
                      </td>
                      <td className="max-w-80 px-5 py-3 leading-6">
                        {status === "rejected" ? (app.rejectReason ?? "—") : (app.note ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    );
  }

  // Kiểm tra tài khoản của từng đề xuất (truy vấn tài khoản FireAnt qua linked server).
  const checked = await Promise.all(
    applications.map(async (app) => {
      const account = await checkStaffAccount(app.userName);
      const checks = reviewChecks(app, account);
      const blockedReason = staffAccountProblem(account, app.partnerId);
      return { app, checks, blockedReason };
    }),
  );
  const selected = checked.find((q) => String(q.app.id) === params.id) ?? checked[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      {HEADER}
      {tabs}

      <div className="grid items-start gap-5 lg:grid-cols-12">
        <nav aria-label="Hàng chờ duyệt" className="flex flex-col gap-2 lg:col-span-5 xl:col-span-4">
          {checked.map(({ app, blockedReason }) => {
            const active = selected?.app.id === app.id;
            const name = app.fullName ?? app.userName;
            return (
              <Link
                key={app.id}
                href={`/admin/approvals?id=${app.id}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex gap-3 rounded-2xl border bg-card px-4 py-3 shadow-xs transition-colors",
                  active ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {initialsOf(name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{name}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">{formatDay(app.createdAt)}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{app.userName}</span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    Đề xuất bởi <span className="font-semibold text-foreground">{app.partnerName}</span> ·{" "}
                    {partnerPolicy(app.partnerId)}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 w-fit rounded-full border px-2 py-0.5 text-xs font-semibold",
                      CHECK_STYLES[blockedReason ? "bad" : "ok"].chip,
                    )}
                  >
                    {blockedReason ? blockedReason.replace(/\.$/, "") : "Đạt tất cả"}
                  </span>
                </span>
              </Link>
            );
          })}
          {checked.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-6 text-sm leading-6 text-muted-foreground">
              Hàng chờ trống. Đối tác gửi đề xuất ở trang Nhân viên bán hàng của họ.
            </p>
          ) : null}
        </nav>

        <div className="lg:col-span-7 xl:col-span-8">
          <ApplicationDecision
            today={format(new Date(), "dd/MM/yyyy")}
            target={
              selected
                ? {
                    id: selected.app.id,
                    name: selected.app.fullName ?? selected.app.userName,
                    partnerName: selected.app.partnerName,
                    blockedReason: selected.blockedReason,
                  }
                : null
            }
          >
            {selected ? (
              <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                    {initialsOf(selected.app.fullName ?? selected.app.userName)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-lg font-semibold">{selected.app.fullName ?? selected.app.userName}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {selected.app.userName}
                      {selected.app.phone ? ` · ${selected.app.phone}` : ""}
                    </span>
                  </span>
                </div>

                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-muted-foreground">Đối tác đề xuất</dt>
                    <dd>
                      <Link href={`/admin/partners/${selected.app.partnerId}`} className="font-semibold hover:text-primary hover:underline">
                        {selected.app.partnerName}
                      </Link>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-muted-foreground">Chính sách đối tác</dt>
                    <dd>{partnerPolicy(selected.app.partnerId)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-muted-foreground">Ngày gửi</dt>
                    <dd className="num">{format(selected.app.createdAt, "dd/MM/yyyy HH:mm")}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium text-muted-foreground">Ghi chú</dt>
                    <dd className="leading-6">{selected.app.note ?? "—"}</dd>
                  </div>
                </dl>

                <div className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold">Kiểm tra tự động</h2>
                  <ul className="flex flex-col gap-1.5">
                    {selected.checks.map((check) => {
                      const Icon = CHECK_ICONS[check.kind];
                      return (
                        <li
                          key={check.text}
                          className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2 text-sm leading-6", CHECK_STYLES[check.kind].row)}
                        >
                          <span
                            aria-hidden
                            className={cn("mt-1 flex size-4 shrink-0 items-center justify-center rounded-full", CHECK_STYLES[check.kind].icon)}
                          >
                            <Icon className="size-3" strokeWidth={3} />
                          </span>
                          <span>
                            <span className="sr-only">{CHECK_LABELS[check.kind]}: </span>
                            {check.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            ) : null}
          </ApplicationDecision>
        </div>
      </div>
    </div>
  );
}
