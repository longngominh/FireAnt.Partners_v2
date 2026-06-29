import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { auth } from "@/auth";
import { PartnerForm } from "@/components/features/admin/partner-form";
import { DeletePartnerButton } from "@/components/features/admin/delete-partner-button";
import { Button } from "@/components/ui/button";
import { updatePartnerAction } from "@/lib/admin/actions";
import { getPartner } from "@/lib/data/partners";

export const metadata = { title: "Sửa cộng tác viên" };

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const partner = await getPartner(id);
  if (!partner) notFound();

  const action = updatePartnerAction.bind(null, partner.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit gap-2">
          <Link href={`/admin/partners/${partner.id}`}>
            <ArrowLeftIcon className="size-4" /> Quay lại
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Sửa cộng tác viên</h1>
            <p className="text-sm text-muted-foreground">
              Cập nhật thông tin cho {partner.name ?? partner.email}.
            </p>
          </div>
          <DeletePartnerButton partnerId={partner.id} />
        </div>
      </div>

      <PartnerForm action={action} partner={partner} />
    </div>
  );
}
