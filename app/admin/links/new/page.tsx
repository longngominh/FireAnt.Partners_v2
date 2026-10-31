import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import {
  CreatePaymentWorkspace,
  type CreateMode,
  type PartnerOption,
} from "@/components/features/payment/create-payment-workspace";
import { requireAdminSession } from "@/lib/auth/session";
import { listPackages } from "@/lib/data/packages";
import { listPartners } from "@/lib/data/partners";
import { listCouponSources } from "@/lib/data/payment";
import { sourceSuggestions } from "@/lib/payment/source";

export const metadata = { title: "Tạo link hộ đối tác" };

type SearchParams = Promise<{ mode?: string; partner?: string }>;

export default async function AdminCreateLinkPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params] = await Promise.all([requireAdminSession(), searchParams]);
  const [packages, partnerRows, usedSources] = await Promise.all([
    listPackages(),
    listPartners(),
    listCouponSources(null),
  ]);

  const partners: PartnerOption[] = partnerRows
    .filter((p) => p.isActive && !p.isStaff)
    .sort((a, b) => (a.name ?? a.username).localeCompare(b.name ?? b.username, "vi"))
    .map((p) => ({ id: p.id, label: p.name ? `${p.name} · ${p.email}` : p.email }));

  // Chọn sẵn: ?partner= (từ hồ sơ đối tác / bộ lọc link) → đối tác gắn với tài khoản quản lý → để trống.
  const requested = partners.find((p) => String(p.id) === params.partner);
  const own = partners.find((p) => String(p.id) === session.user.partnerId);
  const preselect = requested ?? own ?? null;
  const defaultMode: CreateMode = params.mode === "upgrade" ? "upgrade" : "purchase";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tạo link hộ đối tác"
        description="Link, đơn và doanh số được ghi cho đối tác được chọn — dùng khi đối tác nhờ FireAnt tạo giúp hoặc bán qua kênh của công ty."
        actions={
          <Button asChild variant="outline" className="h-10 gap-2">
            <Link href={preselect ? `/admin/links?partner=${preselect.id}` : "/admin/links"}>
              <LinkIcon className="size-4" />
              Link đã tạo
            </Link>
          </Button>
        }
      />

      <CreatePaymentWorkspace
        packages={packages}
        isAdmin
        partners={partners}
        sessionPartnerId={preselect ? String(preselect.id) : null}
        defaultMode={defaultMode}
        sourceSuggestions={sourceSuggestions(usedSources)}
      />
    </div>
  );
}
