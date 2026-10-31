import Link from "next/link";
import { ChevronDownIcon, PhoneIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requirePortalSession } from "@/lib/auth/session";
import { getPortalAffiliation } from "@/lib/data/portal";

export const metadata = { title: "Hướng dẫn bán hàng" };

const STEPS = [
  {
    title: "Tạo link cho khách",
    body: "Nhập email tài khoản FireAnt của khách, chọn gói và cách thanh toán. Khách chưa có tài khoản thì tạo hộ ngay ở bước này.",
    href: "/payment/create",
    link: "Tạo link bán hàng",
  },
  { title: "Gửi link hoặc QR", body: "Gửi qua Zalo, tin nhắn hoặc email kèm lời nhắn gợi ý. Link hiệu lực 14 ngày." },
  { title: "Khách thanh toán", body: "Chuyển khoản qua QR hoặc trả bằng thẻ. Gói kích hoạt tự động khi khách trả đúng số tiền." },
];

const FAQ = [
  {
    q: "Khách chưa có tài khoản FireAnt thì sao?",
    a: "Ở bước nhập email, bấm “Tạo tài khoản cho khách”. FireAnt gửi email để khách tự đặt mật khẩu. Khách đã trả tiền mà chưa có tài khoản thì đơn nằm ở mục Đơn chờ tài khoản.",
  },
  {
    q: "Khách muốn trả bằng thẻ?",
    a: "Ở bước “Cách khách thanh toán”, chọn Thẻ nội địa hoặc Thẻ quốc tế. Khách mở link và nhập thẻ trên trang thanh toán của FireAnt.",
  },
  {
    q: "Link hết hạn hoặc khách muốn đổi gói?",
    a: "Tạo link mới cho khách. Link chưa thanh toán sẽ tự hết hạn sau 14 ngày; link đã thanh toán không sửa được.",
  },
  {
    q: "Dùng mã khuyến mại thế nào?",
    a: "Nhập mã do FireAnt cấp ở bước Gói dịch vụ. Lượt dùng mã được tính ngay khi tạo link; doanh số tính theo số tiền sau giảm.",
  },
];

export default async function GuidePage() {
  const { partnerId, role } = await requirePortalSession();
  const isStaff = role === "staff";
  const affiliation = isStaff ? await getPortalAffiliation(partnerId) : null;
  const follow = isStaff
    ? { body: "Xem trạng thái link, khách và doanh số của bạn. Link sắp hết hạn được nhắc ở Tổng quan.", href: "/sales", link: "Doanh số của tôi" }
    : { body: "Xem link và khách của bạn và nhân viên, doanh thu và phí/thù lao tạm tính trong tháng.", href: "/earnings", link: "Thu nhập & hợp đồng" };
  const roleFaq = isStaff
    ? {
        q: "Thu nhập của tôi tính thế nào?",
        a: `Do ${affiliation ? `đối tác ${affiliation.partnerName}` : "đối tác"} chi trả theo thỏa thuận giữa bạn và đối tác. Trang Doanh số của tôi có bảng kê từng đơn để đối chiếu.`,
      }
    : {
        q: "Đơn nào được tính phí/thù lao?",
        a: "Với phụ lục Bạc, Vàng, Kim cương: đơn của khách mua gói hội viên lần đầu, gồm cả đơn của nhân viên trong thời gian được ghi nhận. Gia hạn và nâng cấp vẫn hiện trong doanh thu nhưng chưa tính phí/thù lao. Chính sách Thường tính trên toàn bộ doanh số gói hội viên. Khóa học FireAnt Academy được thanh toán riêng, không tính ở đây.",
      };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Hướng dẫn bán hàng" description="Bốn bước từ lúc tạo link tới lúc khách dùng được gói, và các câu hỏi hay gặp." />

      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...STEPS, { title: "Theo dõi", ...follow }].map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2.5 rounded-2xl border bg-card p-5 shadow-xs">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {index + 1}
            </span>
            <span className="text-base font-semibold">{step.title}</span>
            <span className="text-sm leading-6 text-muted-foreground">{step.body}</span>
            {"href" in step && step.href ? (
              <Link href={step.href} className="mt-auto w-fit text-[13px] font-semibold text-primary hover:underline">
                {step.link}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>

      <section aria-labelledby="faq" className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
        <h2 id="faq" className="border-b px-5 py-4 text-base font-semibold">
          Câu hỏi thường gặp
        </h2>
        {[...FAQ, roleFaq].map((item, index) => (
          <details key={item.q} open={index === 0} className="group border-b px-5 last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDownIcon className="size-4.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-4 text-sm leading-6 text-foreground/85">{item.a}</p>
          </details>
        ))}
      </section>

      <div className="flex gap-3 rounded-xl border bg-card px-4 py-3.5 text-sm">
        <PhoneIcon className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
        {isStaff
          ? `Cần hỗ trợ: hỏi ${affiliation ? `đối tác ${affiliation.partnerName}` : "đối tác của bạn"} trước. Vấn đề tài khoản hoặc thanh toán của khách, liên hệ FireAnt.`
          : "Cần hỗ trợ: liên hệ người quản lý đối tác của FireAnt. Vấn đề tài khoản hoặc thanh toán của khách, FireAnt xử lý trong giờ làm việc."}
      </div>
    </div>
  );
}
