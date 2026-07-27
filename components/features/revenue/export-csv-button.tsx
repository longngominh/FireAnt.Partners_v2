"use client";

import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MonthlyPartnerRevenue, MonthlyRevenueTotals } from "@/lib/data/revenue";
import type { MonthKey } from "@/lib/utils/month";
import { buildMonthlyRevenueCsv, monthlyRevenueCsvFilename } from "./csv";

type Props = {
  rows: MonthlyPartnerRevenue[];
  totals: MonthlyRevenueTotals;
  month: MonthKey;
};

export function ExportCsvButton({ rows, totals, month }: Props) {
  function handleExport() {
    if (rows.length === 0) {
      toast.error("Không có dữ liệu để xuất.");
      return;
    }

    const csv = buildMonthlyRevenueCsv(rows, totals, month);
    // BOM để Excel nhận UTF-8, tránh vỡ dấu tiếng Việt.
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = monthlyRevenueCsvFilename(month);
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`Đã xuất ${rows.length} dòng.`);
  }

  return (
    <Button type="button" variant="outline" onClick={handleExport}>
      <DownloadIcon className="size-4" /> Xuất CSV
    </Button>
  );
}
