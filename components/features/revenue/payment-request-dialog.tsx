"use client";

import { useState } from "react";
import { FileSpreadsheetIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND } from "@/lib/utils/currency";
import { formatMonthRangeLabel, type MonthKey } from "@/lib/utils/month";

type Props = {
  month: MonthKey;
  searchParams: Record<string, string | undefined>;
  defaultRequesterName: string;
  payableCount: number;
  payableAmount: number;
};

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function PaymentRequestDialog({
  month,
  searchParams,
  defaultRequesterName,
  payableCount,
  payableAmount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [requesterName, setRequesterName] = useState(defaultRequesterName);
  const [department, setDepartment] = useState("Phòng Kinh doanh");
  const [city, setCity] = useState("Hà Nội");
  const [issuedAt, setIssuedAt] = useState(todayInputValue());

  async function handleExport() {
    setIsExporting(true);
    try {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(searchParams)) {
        if (value && key !== "month") sp.set(key, value);
      }
      sp.set("month", month);
      sp.set("requesterName", requesterName);
      sp.set("department", department);
      sp.set("city", city);
      sp.set("issuedAt", issuedAt);

      const res = await fetch(`/api/admin/revenue/payment-request?${sp.toString()}`);
      if (!res.ok) {
        toast.error(await res.text());
        return;
      }

      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? `De nghi TT CTV ${month}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("Đã tạo giấy đề nghị thanh toán.");
      setOpen(false);
    } catch {
      toast.error("Không tạo được file. Vui lòng thử lại.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <FileSpreadsheetIcon className="size-4" /> Giấy đề nghị thanh toán
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Giấy đề nghị thanh toán</DialogTitle>
          <DialogDescription>
            {payableCount > 0
              ? `${payableCount} cộng tác viên nhận hoa hồng ${formatVND(payableAmount)} cho kỳ ${formatMonthRangeLabel(month)}.`
              : "Danh sách đang lọc không có cộng tác viên nào phát sinh hoa hồng."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="requesterName">Tên tôi là</Label>
            <Input
              id="requesterName"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder="Họ tên người đề nghị"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="department">Bộ phận công tác</Label>
            <Input
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="city">Nơi lập</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issuedAt">Ngày lập</Label>
              <Input
                id="issuedAt"
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Hủy
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting || payableCount === 0 || !requesterName.trim()}
          >
            {isExporting ? "Đang tạo..." : "Tải file Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
