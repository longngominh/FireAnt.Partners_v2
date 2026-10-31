"use client";

import { useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangleIcon className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold">Có lỗi xảy ra</p>
            <p className="text-sm text-muted-foreground">
              {error.message || "Vui lòng thử lại sau."}
            </p>
          </div>
          <Button onClick={reset} size="sm">
            Thử lại
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
