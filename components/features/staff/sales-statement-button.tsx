"use client";

import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type StatementRow = {
  date: string;
  code: string;
  customer: string;
  packageName: string;
  kind: string;
  amount: number;
};

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Tải bảng kê giao dịch trong tháng (CSV mở được bằng Excel) để đối chiếu với đối tác. */
export function SalesStatementButton({ rows, filename }: { rows: StatementRow[]; filename: string }) {
  function handleExport() {
    if (rows.length === 0) {
      toast.error("Tháng này chưa có giao dịch để tải.");
      return;
    }
    const header = ["Ngày thanh toán", "Mã link", "Khách", "Gói", "Loại đơn", "Giá trị (đ)"];
    const lines = [header, ...rows.map((r) => [r.date, r.code, r.customer, r.packageName, r.kind, r.amount])];
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    lines.push(["Tổng", "", "", "", `${rows.length} đơn`, total]);
    const csv = lines.map((line) => line.map(cell).join(",")).join("\n");
    // BOM để Excel nhận UTF-8, tránh vỡ dấu tiếng Việt.
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" className="h-10" onClick={handleExport}>
      <DownloadIcon className="size-4" /> Tải bảng kê
    </Button>
  );
}
