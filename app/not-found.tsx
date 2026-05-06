import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="text-6xl font-mono font-semibold text-muted-foreground">
          404
        </span>
        <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
        <p className="text-sm text-muted-foreground">
          Đường dẫn này không tồn tại hoặc đã bị thu hồi.
        </p>
        <Button asChild size="sm">
          <Link href="/dashboard">Về trang chính</Link>
        </Button>
      </div>
    </div>
  );
}
