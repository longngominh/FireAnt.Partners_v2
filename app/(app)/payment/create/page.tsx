import { CreatePaymentForm } from "@/components/features/payment/create-form";
import { auth } from "@/auth";
import { listPackages } from "@/lib/data/packages";
import { listPartners } from "@/lib/data/partners";

export const metadata = { title: "Tạo link thanh toán" };

export default async function CreatePaymentPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "admin";
  const packages = await listPackages();
  const partners = isAdmin
    ? (await listPartners()).filter((partner) => partner.isActive)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tạo link thanh toán</h1>
        <p className="text-sm text-muted-foreground">
          Chọn gói dịch vụ và thời hạn. Hệ thống tạo link rút gọn + QR ngay lập tức.
        </p>
      </div>
      <CreatePaymentForm packages={packages} partners={partners} />
    </div>
  );
}
