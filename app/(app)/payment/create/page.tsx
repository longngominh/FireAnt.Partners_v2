import Link from "next/link";
import { TicketIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  CreatePaymentWorkspace,
  type CreateMode,
  type PartnerOption,
} from "@/components/features/payment/create-payment-workspace";
import { listPackages } from "@/lib/data/packages";
import { listPartners } from "@/lib/data/partners";
import { listCouponSources } from "@/lib/data/payment";
import { sourceSuggestions } from "@/lib/payment/source";

export const metadata = { title: "Tạo link thanh toán" };

type SearchParams = Promise<{ mode?: string }>;

export default async function CreatePaymentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const isAdmin = session?.user.role === "admin";
  const sessionPartnerId = session?.user.partnerId ?? null;

  const [packages, partnerRows, usedSources] = await Promise.all([
    listPackages(),
    isAdmin ? listPartners() : Promise.resolve([]),
    // Gợi ý nguồn: nguồn đối tác này đã dùng (admin: của mọi đối tác).
    isAdmin || sessionPartnerId ? listCouponSources(isAdmin ? null : sessionPartnerId) : Promise.resolve([]),
  ]);

  const partners: PartnerOption[] = partnerRows
    .filter((p) => p.isActive)
    .map((p) => ({ id: p.id, label: p.name ? `${p.name} · ${p.email}` : p.email }));

  const defaultMode: CreateMode = params.mode === "upgrade" ? "upgrade" : "purchase";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tạo link thanh toán</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Bán gói hội viên, khóa học hoặc nâng cấp hạng cho khách đang dùng. Hệ thống tạo đơn hàng, link rút gọn và
            QR chuyển khoản định danh ngay lập tức — kích hoạt tự động khi nhận tiền. Khách mua gói muốn trả bằng thẻ
            (nội địa hoặc Visa/Mastercard/JCB) thì chọn ở bước 3. Có thể áp mã khuyến mại do FireAnt cấp và gắn
            nguồn khách để theo dõi.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/payment">
            <TicketIcon className="size-4" />
            Link đã tạo
          </Link>
        </Button>
      </div>

      <CreatePaymentWorkspace
        packages={packages}
        isAdmin={isAdmin}
        partners={partners}
        sessionPartnerId={sessionPartnerId}
        defaultMode={defaultMode}
        sourceSuggestions={sourceSuggestions(usedSources)}
      />
    </div>
  );
}
