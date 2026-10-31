import { PageHeader } from "@/components/shared/page-header";
import { PendingAccountsView } from "@/components/features/payment/pending-accounts-view";
import { requireAdminSession } from "@/lib/auth/session";

export const metadata = { title: "Đơn chờ tài khoản" };

type SearchParams = Promise<{ q?: string; page?: string }>;

export default async function AdminPendingAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const [, params] = await Promise.all([requireAdminSession(), searchParams]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Đơn chờ tài khoản"
        description="Đơn đã thu tiền qua link của mọi đối tác và nhân viên nhưng email trên đơn chưa có tài khoản FireAnt — gói chưa có hiệu lực. Tạo hộ tài khoản hoặc nhắc đối tác liên hệ khách."
      />
      <PendingAccountsView
        partnerId={null}
        basePath="/admin/pending-accounts"
        q={params.q ?? ""}
        page={Number(params.page ?? "1") || 1}
      />
    </div>
  );
}
