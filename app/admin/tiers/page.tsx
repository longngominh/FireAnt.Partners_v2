import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, StatCard } from "@/components/shared/panel";
import { TierSchedule } from "@/components/features/tiers/tier-schedule";
import { TierBadge } from "@/components/features/tiers/tier-ui";
import { requireAdminSession } from "@/lib/auth/session";
import {
  calcPartnerRemuneration,
  CONTRACT_TIERS,
  contractTierScheme,
  TIER_APPENDIX,
  type ContractTier,
} from "@/lib/commission";
import { getContractsForMonth } from "@/lib/data/contracts";
import { listPartners } from "@/lib/data/partners";
import { formatNumber, formatPercent, formatShortVND, formatVND } from "@/lib/utils/currency";
import { currentMonthKey } from "@/lib/utils/month";

export const metadata = { title: "Biểu phụ lục" };

/** Mốc tra nhanh: các ví dụ trong phụ lục và hai bên mỗi ngưỡng. */
const LOOKUP = [30, 50, 80, 99, 100, 150, 199, 200, 250, 300].map((m) => m * 1_000_000);

const RULES: Array<{ title: string; body: string }> = [
  {
    title: "Phụ lục của đối tác",
    body: "FireAnt chọn ở hồ sơ đối tác theo phụ lục đối tác đã ký. Phụ lục áp dụng cho cả tháng, tính từ ngày 01; muốn bắt đầu từ tháng sau thì đổi vào tháng đó. Các tháng trước giữ phụ lục đã dùng. Chưa chọn phụ lục là chính sách Thường.",
  },
  {
    title: "Căn cứ tính",
    body: "Phụ lục Bạc, Vàng, Kim cương: doanh thu khách mua gói hội viên lần đầu trong tháng dương lịch — tài khoản chưa từng có đơn hội viên đã thanh toán ở bất kỳ kênh nào. Chính sách Thường: toàn bộ doanh số gói hội viên. Số tiền là thực thu sau mã khuyến mại.",
  },
  {
    title: "Nhân viên của đối tác",
    body: "Doanh số qua link của nhân viên được cộng vào đối tác trong thời gian được ghi nhận (từ lúc FireAnt duyệt tới lúc ngừng hợp tác). Nhân viên không có hạng, không ký hợp đồng và không nhận thanh toán từ FireAnt.",
  },
  {
    title: "Chưa tính theo phụ lục",
    body: "Gia hạn, nâng cấp và gói khác vẫn ghi nhận doanh thu nhưng chưa có biểu theo phụ lục (điểm b, c của phụ lục). Bổ sung chính sách phải báo đối tác trước ít nhất 15 ngày.",
  },
  {
    title: "Khóa học",
    body: "Khóa học FireAnt Academy bán qua link không tính phí/thù lao ở trang Partner, kể cả chính sách Thường và NVKD. Đào tạo thanh toán ở phần Quản lý khóa học bên Admin.",
  },
  {
    title: "Nhân viên kinh doanh FireAnt",
    body: "Không theo phụ lục; vẫn theo chế độ lương cứng + bậc hoa hồng. Lương cứng trả qua bảng lương, không nằm trong giấy đề nghị thanh toán.",
  },
  {
    title: "Ưu đãi khách qua link giới thiệu",
    body: "Phụ lục cho khách đăng ký qua link giới thiệu thêm 10% thời gian gói. Hệ thống chưa tự cộng — cần tích hợp phía fireant.vn; hiện xử lý thủ công khi khách yêu cầu.",
  },
];

function payoutFor(tier: ContractTier, revenue: number) {
  // Bảng tra giả định toàn bộ doanh số là khách mới để so được các chính sách trên cùng một mức.
  return calcPartnerRemuneration("collaborator", tier, { total: revenue, newCustomer: revenue });
}

export default async function AdminTiersPage() {
  await requireAdminSession();
  const [partners, contracts] = await Promise.all([listPartners(), getContractsForMonth(currentMonthKey())]);

  const active = partners.filter((p) => p.isActive && !p.isStaff && p.partnerType === "collaborator");
  const counts = Object.fromEntries(CONTRACT_TIERS.map((t) => [t, 0])) as Record<ContractTier, number>;
  for (const p of active) counts[contracts.get(p.id)?.tier ?? "normal"] += 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Biểu phụ lục"
        description="Biểu phí/thù lao đối tác theo phụ lục hợp đồng. Trang chỉ để tra cứu: đổi mức hoặc tỷ lệ cần phát hành phụ lục mới rồi cập nhật hệ thống. Phụ lục của từng đối tác chọn ở hồ sơ đối tác."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...CONTRACT_TIERS].reverse().map((tier) => (
          <StatCard
            key={tier}
            label={contractTierScheme(tier)}
            value={<span className="num">{formatNumber(counts[tier])} đối tác</span>}
            hint={tier === "normal" ? "Chưa chọn phụ lục hạng" : TIER_APPENDIX[tier]}
            href={`/admin/partners?tier=${tier}`}
          />
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {[...CONTRACT_TIERS].reverse().map((tier) => (
          <Panel
            key={tier}
            title={
              <span className="flex items-center gap-2">
                <TierBadge tier={tier} size="md" />
                {tier === "normal" ? "Chính sách Thường" : TIER_APPENDIX[tier]}
              </span>
            }
            description={
              tier === "normal"
                ? "Bậc lũy tiến trên doanh số gói hội viên trong tháng"
                : "Trên doanh thu khách mua gói hội viên lần đầu, đúng bảng “Cách tính thù lao” của phụ lục"
            }
          >
            <TierSchedule tier={tier} />
          </Panel>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title="Bảng tra nhanh"
          description="Phí/thù lao tháng theo từng chính sách, giả định cùng một mức doanh thu tính thù lao"
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-semibold">Doanh thu</th>
                  {[...CONTRACT_TIERS].reverse().map((tier) => (
                    <th key={tier} className="px-3 py-2.5 text-right font-semibold last:pr-5">
                      <TierBadge tier={tier} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LOOKUP.map((revenue) => (
                  <tr key={revenue} className="border-b last:border-b-0">
                    <td className="num px-5 py-2.5 font-medium">{formatShortVND(revenue)}</td>
                    {[...CONTRACT_TIERS].reverse().map((tier) => {
                      const r = payoutFor(tier, revenue);
                      return (
                        <td key={tier} className="num px-3 py-2.5 text-right last:pr-5">
                          <span className="flex flex-col items-end">
                            <span className="font-semibold">{formatVND(r.commission + r.performanceBonus)}</span>
                            <span className="text-xs text-muted-foreground">{formatPercent(r.effectiveRate)}</span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="lg:col-span-5" title="Quy tắc áp dụng">
          <dl className="flex flex-col">
            {RULES.map((rule) => (
              <div key={rule.title} className="flex flex-col gap-1 border-t py-3 first:border-t-0 first:pt-1">
                <dt className="text-sm font-semibold">{rule.title}</dt>
                <dd className="text-[13px] leading-6 text-muted-foreground">{rule.body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Xem cách tính từng đối tác ở{" "}
            <Link href="/admin/payouts" className="font-semibold text-primary hover:underline">
              Thù lao &amp; chi trả
            </Link>
            .
          </p>
        </Panel>
      </div>
    </div>
  );
}
