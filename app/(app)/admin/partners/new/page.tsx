import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { CreatePartnerForm } from "@/components/features/admin/create-partner-form";
import { redirect } from "next/navigation";

export const metadata = { title: "Tạo tài khoản đối tác" };

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
            Tạo tài khoản đối tác
          </h1>
          <p className="text-sm text-muted-foreground">
            Cấp tài khoản đăng nhập V2 cho một đối tác đã có sẵn trong hệ thống FireAnt.
          </p>
        </div>
      </div>

      <CreatePartnerForm />
    </div>
  );
}
