import { PageHeader } from "@/components/shared/page-header";
import { PendingAccountsView } from "@/components/features/payment/pending-accounts-view";
import { requirePortalSession } from "@/lib/auth/session";

export const metadata = { title: "Đơn chờ tài khoản" };

type SearchParams = Promise<{ q?: string; page?: string }>;

export default async function PendingAccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [{ partnerId, role }, params] = await Promise.all([requirePortalSession(), searchParams]);
  const isStaff = role === "staff";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Đơn chờ tài khoản"
        description={
          <>
            Khách đã thanh toán nhưng email trên đơn chưa có tài khoản FireAnt. Gói chỉ có hiệu lực khi có tài khoản đúng email
            đó — nhắc khách đăng ký, hoặc bấm <strong>Tạo tài khoản</strong> để tạo hộ khách (FireAnt gửi email để khách tự đặt
            mật khẩu). Đơn tự rời khỏi danh sách ngay khi tài khoản được tạo.
            {isStaff ? null : " Danh sách gồm cả đơn qua link của nhân viên."}
          </>
        }
      />
      <PendingAccountsView
        partnerId={isStaff ? partnerId : null}
        teamOf={isStaff ? null : partnerId}
        basePath="/payment/pending-account"
        q={params.q ?? ""}
        page={Number(params.page ?? "1") || 1}
      />
    </div>
  );
}
