import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { TaxCodeForm } from "@/components/features/staff/tax-code-form";
import { ContractChip } from "@/components/features/tiers/tier-ui";
import { requirePortalSession, sessionDisplayName } from "@/lib/auth/session";
import { PARTNER_TYPE_LABELS } from "@/lib/commission";
import { getPartnerSummary, getPortalAffiliation, getPortalContract } from "@/lib/data/portal";
import { formatDay, formatMonthStart } from "@/lib/utils/month";

export const metadata = { title: "Hồ sơ" };

export default async function ProfilePage() {
  const { session, partnerId, role } = await requirePortalSession();
  const summary = await getPartnerSummary(partnerId);
  const name = summary?.fullName || sessionDisplayName(session);
  const login = summary?.userName ?? session.user.email ?? "—";

  if (role === "staff") {
    const affiliation = await getPortalAffiliation(partnerId);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Hồ sơ cá nhân" />
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <Panel title="Đối tác bạn đang trực thuộc">
              {affiliation ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-lg font-bold">{affiliation.partnerName}</span>
                    <span
                      className={
                        affiliation.isActive
                          ? "inline-flex h-7 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 text-[13px] font-semibold text-success"
                          : "inline-flex h-7 items-center rounded-full border bg-muted px-2.5 text-[13px] font-semibold"
                      }
                    >
                      {affiliation.isActive ? "Đang hoạt động" : "Đã ngừng ghi nhận"}
                    </span>
                  </div>
                  <dl className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">Ghi nhận doanh số từ</dt>
                      <dd className="font-semibold">{formatDay(affiliation.startDate)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">Ghi nhận tới</dt>
                      <dd className="font-semibold">{affiliation.endDate ? formatDay(affiliation.endDate) : "Hiện tại"}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Tài khoản chưa được ghi nhận cho đối tác nào.</p>
              )}
            </Panel>
            <Panel title="Điều bạn cần biết">
              <ul className="flex list-disc flex-col gap-2.5 pl-5 text-sm leading-6 text-foreground/85">
                <li>Doanh số qua link của bạn được tính cho đối tác trong thời gian bạn trực thuộc.</li>
                <li>
                  Thu nhập của bạn do đối tác chi trả theo thỏa thuận giữa hai bên. FireAnt không quản lý và không hiển thị tỷ lệ
                  này.
                </li>
                <li>
                  Một tài khoản chỉ thuộc một đối tác tại một thời điểm. Muốn chuyển sang đối tác khác: đối tác hiện tại ngừng hợp
                  tác, đối tác mới gửi đề xuất, FireAnt duyệt.
                </li>
                <li>Khi bị ngừng hợp tác, bạn vẫn xem được lịch sử doanh số tới ngày ngừng nhưng không tạo được link mới.</li>
              </ul>
            </Panel>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-5">
            <Panel title={name} description="Nhân viên bán hàng">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Tài khoản FireAnt</dt>
                <dd className="text-right font-medium break-all">{login}</dd>
              </dl>
              <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
                Thông tin lấy từ tài khoản FireAnt của bạn. Muốn sửa, vào fireant.vn, mục Tài khoản.
              </p>
            </Panel>
            <Panel title="Thông tin nhận tiền">
              <p className="text-[13px] leading-5 text-muted-foreground">
                Nhân viên không khai báo tài khoản ngân hàng với FireAnt. FireAnt chi trả cho đối tác; đối tác trả cho bạn.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    );
  }

  const contract = await getPortalContract(partnerId);
  const isCollaborator = summary?.partnerType !== "sales_employee";
  const missing = [!summary?.bankAccountNumber && "số tài khoản", !summary?.taxCode && "mã số thuế"].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Hồ sơ & thông tin chi trả" />
      {missing.length > 0 ? (
        <div role="status" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4.5 shrink-0 text-warning" />
          <span>
            <strong className="font-semibold">Thiếu thông tin chi trả: {missing.join(", ")}.</strong> Bổ sung để FireAnt chốt chi
            trả đúng hạn.
          </span>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <Panel title={name} description={summary?.legalType === "company" ? "Đối tác pháp nhân" : "Đối tác cá nhân"}>
            <dl className="grid grid-cols-[170px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Tài khoản đăng nhập</dt>
              <dd className="font-medium break-all">{login}</dd>
              <dt className="text-muted-foreground">Loại</dt>
              <dd className="font-medium">
                {summary ? PARTNER_TYPE_LABELS[summary.partnerType] : "—"}
              </dd>
              <dt className="text-muted-foreground">Hợp tác từ</dt>
              <dd className="font-medium">{formatDay(summary?.createdAt ?? null)}</dd>
              <dt className="text-muted-foreground">Nhân viên bán hàng</dt>
              <dd className="font-medium">
                <Link href="/team" className="font-semibold text-primary hover:underline">
                  Quản lý nhân viên
                </Link>
              </dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">Đổi tên, loại đối tác hoặc hợp đồng cần làm việc với FireAnt.</p>
          </Panel>
          {isCollaborator ? (
            <Panel title="Phụ lục đang áp dụng">
              <div className="flex flex-col gap-3">
                <ContractChip
                  tier={contract.tier}
                  since={contract.effectiveMonth ? formatMonthStart(contract.effectiveMonth) : null}
                />
                <p className="text-[13px] leading-5 text-muted-foreground">
                  FireAnt cập nhật phụ lục theo văn bản bạn đã ký. Phụ lục áp dụng cho cả tháng, tính từ ngày 01.
                </p>
                <Link href="/earnings" className="w-fit text-[13px] font-semibold text-primary hover:underline">
                  Xem cách tính phí/thù lao
                </Link>
              </div>
            </Panel>
          ) : null}
        </div>
        <Panel className="lg:col-span-5" title="Thông tin chi trả">
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Người thụ hưởng</dt>
              <dd className="text-right font-semibold">{(summary?.fullName ?? "—").toUpperCase()}</dd>
              <dt className="text-muted-foreground">Ngân hàng</dt>
              <dd className="text-right font-semibold">{summary?.bankName ?? "—"}</dd>
              <dt className="text-muted-foreground">Số tài khoản</dt>
              <dd className="text-right font-semibold">
                {summary?.bankAccountNumber ? `••••${summary.bankAccountNumber.slice(-4)}` : "Chưa có"}
              </dd>
              <dt className="text-muted-foreground">Mã số thuế</dt>
              <dd className="text-right font-semibold">{summary?.taxCode ?? "Chưa cập nhật"}</dd>
            </dl>
            <TaxCodeForm current={summary?.taxCode ?? null} />
            <p className="text-xs leading-5 text-muted-foreground">
              FireAnt chỉ chuyển vào tài khoản đứng tên người ký hợp đồng. Đổi tài khoản ngân hàng cần liên hệ FireAnt để xác
              nhận.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
