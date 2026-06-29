import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { PartnerForm } from "@/components/features/admin/partner-form";
import { createPartnerAction } from "@/lib/admin/actions";
import { redirect } from "next/navigation";

export const metadata = { title: "Thêm cộng tác viên" };

export default async function NewPartnerPage() {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit gap-2">
          <Link href="/admin/partners">
            <ArrowLeftIcon className="size-4" /> Quay lại
          </Link>
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Thêm cộng tác viên
          </h1>
        </div>
      </div>

      <PartnerForm action={createPartnerAction} />
    </div>
  );
}
