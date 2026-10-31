import { InfoIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { ProposeStaffForm } from "@/components/features/staff/propose-staff-form";
import { requirePartnerSession } from "@/lib/auth/session";
import { hasStaffModel, STAFF_MIGRATION_HINT } from "@/lib/data/staff-model";

export const metadata = { title: "Đề xuất nhân viên" };

const STEPS = [
  { title: "Bạn gửi đề xuất", desc: "Nhập email tài khoản FireAnt, họ tên và số điện thoại của nhân viên." },
  { title: "FireAnt kiểm tra", desc: "Tài khoản tồn tại và đã xác thực, chưa thuộc đối tác khác, không phải đối tác có hợp đồng riêng." },
  { title: "Duyệt hoặc từ chối", desc: "Từ chối luôn kèm lý do, hiện ở tab Đề xuất." },
  { title: "Bắt đầu ghi nhận", desc: "Ngày duyệt là ngày doanh số của nhân viên bắt đầu tính cho bạn." },
  { title: "Nhân viên bán hàng", desc: "Nhân viên đăng nhập bằng tài khoản FireAnt và tạo link của riêng mình." },
];

const STATUSES = [
  { label: "Chờ FireAnt duyệt", desc: "Đã gửi đề xuất, chưa được ghi nhận doanh số.", dot: "bg-warning" },
  { label: "Đang hoạt động", desc: "Doanh số qua link của nhân viên tính cho bạn.", dot: "bg-success" },
  { label: "Đã ngừng ghi nhận", desc: "Giao dịch sau ngày ngừng không tính cho bạn.", dot: "bg-muted-foreground" },
  { label: "Bị từ chối", desc: "Kèm lý do, ví dụ tài khoản đang thuộc một đối tác khác.", dot: "bg-destructive" },
];

export default async function ProposeStaffPage() {
  await requirePartnerSession();
  const ready = await hasStaffModel();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Đề xuất nhân viên"
        description="Nhân viên cần có tài khoản FireAnt đã xác thực. Một tài khoản chỉ thuộc một đối tác tại một thời điểm."
      />
      {!ready ? (
        <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <InfoIcon className="mt-0.5 size-4.5 shrink-0 text-warning" />
          {STAFF_MIGRATION_HINT}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ProposeStaffForm disabled={!ready} />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-5">
          <Panel title="Quy trình">
            <ol className="flex flex-col gap-3.5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-primary/8 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{step.title}</span>
                    <span className="text-[13px] leading-5 text-muted-foreground">{step.desc}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Trạng thái của nhân viên">
            <ul className="flex flex-col gap-3">
              {STATUSES.map((s) => (
                <li key={s.label} className="flex gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${s.dot}`} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{s.label}</span>
                    <span className="text-[13px] leading-5 text-muted-foreground">{s.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
