"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminEndStaffAction, adminReopenStaffAction } from "@/lib/admin/staff-actions";
import { cn } from "@/lib/utils";

/** Một dòng nhân viên của đối tác ở hồ sơ quản trị — đã định dạng sẵn ở server. */
export type AdminStaffRow = {
  key: string;
  /** PartnerId của nhân viên; null với đề xuất chưa duyệt. */
  staffPartnerId: number | null;
  name: string;
  userName: string;
  status: "active" | "ended" | "pending";
  from: string;
  to: string;
  revenue: string;
  endedNote: string | null;
};

const STATUS: Record<AdminStaffRow["status"], { label: string; dot: string; fg: string }> = {
  active: { label: "Đang hoạt động", dot: "bg-success", fg: "text-success" },
  ended: { label: "Đã ngừng", dot: "bg-muted-foreground", fg: "text-muted-foreground" },
  pending: { label: "Chờ duyệt", dot: "bg-warning", fg: "text-warning" },
};

export function AdminStaffTable({
  partnerId,
  rows,
  revenueHeader,
}: {
  partnerId: number;
  rows: AdminStaffRow[];
  revenueHeader: string;
}) {
  const router = useRouter();
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(row: AdminStaffRow, kind: "end" | "reopen") {
    if (row.staffPartnerId === null) return;
    const staffPartnerId = row.staffPartnerId;
    startTransition(async () => {
      const result =
        kind === "end"
          ? await adminEndStaffAction(partnerId, staffPartnerId, row.name)
          : await adminReopenStaffAction(partnerId, staffPartnerId, row.name);
      if (result.ok) {
        toast.success(result.message ?? "Đã lưu.");
        setConfirmKey(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Không lưu được.");
      }
    });
  }

  if (rows.length === 0) {
    return <p className="px-5 py-8 text-sm text-muted-foreground">Đối tác chưa có nhân viên bán hàng nào.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-5 py-2.5 font-semibold">Nhân viên</th>
            <th className="px-3 py-2.5 font-semibold">Trạng thái</th>
            <th className="px-3 py-2.5 font-semibold">Ghi nhận từ</th>
            <th className="px-3 py-2.5 font-semibold">Đến</th>
            <th className="px-3 py-2.5 text-right font-semibold">{revenueHeader}</th>
            <th className="px-5 py-2.5 text-right font-semibold">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const status = STATUS[r.status];
            const confirming = confirmKey === r.key;
            return (
              <tr key={r.key} className="border-t align-top hover:bg-muted/30">
                <td className="px-5 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{r.name}</span>
                    <span className="max-w-[240px] truncate text-xs text-muted-foreground">{r.userName}</span>
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={cn("inline-flex items-center gap-1.5 text-[13px]", status.fg)}>
                    <span className={cn("size-1.5 rounded-full", status.dot)} />
                    {status.label}
                  </span>
                  {r.endedNote ? <span className="block text-xs text-muted-foreground">{r.endedNote}</span> : null}
                </td>
                <td className="num px-3 py-3">{r.from}</td>
                <td className="num px-3 py-3">{r.to}</td>
                <td className="num px-3 py-3 text-right font-semibold">{r.revenue}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-col items-end gap-2">
                    {r.status === "pending" ? (
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link href="/admin/approvals">Mở hàng chờ</Link>
                      </Button>
                    ) : r.status === "active" ? (
                      confirming ? (
                        <div className="flex max-w-xs flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-left">
                          <span className="text-[13px] leading-5">
                            Ngừng ghi nhận {r.name} từ hôm nay? Doanh số từ bây giờ không còn tính cho đối tác.
                          </span>
                          <span className="flex justify-end gap-1.5">
                            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmKey(null)} disabled={isPending}>
                              Hủy
                            </Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => run(r, "end")} disabled={isPending}>
                              {isPending ? "Đang lưu…" : "Xác nhận"}
                            </Button>
                          </span>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                          onClick={() => setConfirmKey(r.key)}
                        >
                          Ngừng hợp tác
                        </Button>
                      )
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => run(r, "reopen")} disabled={isPending}>
                        Mở lại
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
