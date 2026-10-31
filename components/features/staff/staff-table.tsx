"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { endStaffAction } from "@/lib/staff/actions";
import { cn } from "@/lib/utils";

/** Một nhân viên trên bảng — đã định dạng sẵn ở server. */
export type StaffRowView = {
  id: number;
  name: string;
  userName: string;
  phone: string | null;
  initials: string;
  isActive: boolean;
  joined: string;
  proposed: string | null;
  ended: string | null;
  endedBy: string | null;
  newCustomers: string;
  revenue: string;
  newRevenue: string;
  orders: string;
  linksThisMonth: number;
  linksPending: number;
};

export function StaffTable({ rows, today }: { rows: StaffRowView[]; today: string }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const selected = rows.find((r) => r.id === openId) ?? null;

  function open(id: number, stop = false) {
    setOpenId(id);
    setConfirming(stop);
  }

  function stop() {
    if (!selected) return;
    startTransition(async () => {
      const result = await endStaffAction(selected.id, selected.name);
      if (result.ok) {
        toast.success(result.message ?? "Đã ngừng hợp tác.");
        setOpenId(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Không lưu được.");
      }
    });
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-semibold">Nhân viên</th>
              <th className="px-3 py-2.5 font-semibold">Trạng thái</th>
              <th className="px-3 py-2.5 font-semibold">Ngày tham gia</th>
              <th className="px-3 py-2.5 text-right font-semibold">Khách mới</th>
              <th className="px-3 py-2.5 text-right font-semibold">Doanh thu tháng</th>
              <th className="px-3 py-2.5 font-semibold">Link bán hàng</th>
              <th className="px-5 py-2.5">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {r.initials}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold">{r.name}</span>
                      <span className="max-w-[220px] truncate text-xs text-muted-foreground">{r.userName}</span>
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[13px]",
                      r.isActive ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", r.isActive ? "bg-success" : "bg-muted-foreground")} />
                    {r.isActive ? "Đang hoạt động" : "Đã ngừng ghi nhận"}
                  </span>
                </td>
                <td className="num px-3 py-3">{r.joined}</td>
                <td className="num px-3 py-3 text-right">{r.newCustomers}</td>
                <td className="num px-3 py-3 text-right font-semibold">{r.revenue}</td>
                <td className="px-3 py-3">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-foreground/80">
                      {r.linksThisMonth} link tháng này · {r.linksPending > 0 ? `${r.linksPending} chờ thanh toán` : "không có link chờ"}
                    </span>
                    <Link href={`/payment?seller=${r.id}`} className="w-fit text-[13px] font-semibold text-primary hover:underline">
                      Xem link
                    </Link>
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => open(r.id)}>
                      Chi tiết
                    </Button>
                    {r.isActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => open(r.id, true)}
                      >
                        Ngừng hợp tác
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={selected !== null} onOpenChange={(value) => (value ? null : setOpenId(null))}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.isActive ? `Đang hoạt động · ghi nhận từ ${selected.joined}` : `Đã ngừng ghi nhận từ ${selected.ended}`}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-6 px-4 pb-8">
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thông tin</h3>
                  <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Tài khoản</dt>
                    <dd className="font-medium break-all">{selected.userName}</dd>
                    <dt className="text-muted-foreground">Số điện thoại</dt>
                    <dd className="font-medium">{selected.phone ?? "—"}</dd>
                    <dt className="text-muted-foreground">Ngày được duyệt</dt>
                    <dd className="font-medium">{selected.joined}</dd>
                  </dl>
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hiệu suất tháng này</h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      ["Doanh thu", selected.revenue],
                      ["Tính thù lao", selected.newRevenue],
                      ["Khách mới", selected.newCustomers],
                      ["Số đơn", selected.orders],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col gap-1 rounded-xl border bg-muted/30 px-3.5 py-2.5">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="num text-lg font-bold">{value}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link bán hàng</h3>
                  <p className="text-sm text-foreground/80">
                    {selected.linksThisMonth} link tạo trong tháng · {selected.linksPending} link đang chờ thanh toán.
                  </p>
                  <Link href={`/payment?seller=${selected.id}`} className="w-fit text-[13px] font-semibold text-primary hover:underline">
                    Xem tất cả link của {selected.name}
                  </Link>
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lịch sử ghi nhận</h3>
                  <ol className="flex flex-col gap-3 text-sm">
                    {selected.ended ? (
                      <li className="flex gap-3">
                        <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-destructive" />
                        <span>
                          <span className="font-semibold">{selected.ended}</span> · Ngừng hợp tác
                          {selected.endedBy ? ` · bởi ${selected.endedBy}` : ""}
                        </span>
                      </li>
                    ) : null}
                    <li className="flex gap-3">
                      <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-success" />
                      <span>
                        <span className="font-semibold">{selected.joined}</span> · FireAnt duyệt, bắt đầu ghi nhận
                      </span>
                    </li>
                    {selected.proposed ? (
                      <li className="flex gap-3">
                        <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-muted-foreground" />
                        <span>
                          <span className="font-semibold">{selected.proposed}</span> · Bạn gửi đề xuất
                        </span>
                      </li>
                    ) : null}
                  </ol>
                </section>

                {selected.isActive ? (
                  <section className="flex flex-col gap-2.5 border-t pt-4">
                    {confirming ? (
                      <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                        <span className="text-sm font-semibold">
                          Ngừng hợp tác với {selected.name} từ hôm nay, {today}?
                        </span>
                        <span className="text-[13px] leading-5 text-foreground/80">
                          Doanh số từ hôm nay không còn tính cho bạn. Link chờ thanh toán của {selected.name} vẫn dùng được nhưng không
                          được ghi nhận. FireAnt có thể mở lại nếu cần.
                        </span>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
                            Hủy
                          </Button>
                          <Button type="button" variant="destructive" size="sm" onClick={stop} disabled={isPending}>
                            {isPending ? "Đang lưu…" : "Xác nhận ngừng"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-fit border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => setConfirming(true)}
                      >
                        Ngừng hợp tác với nhân viên
                      </Button>
                    )}
                  </section>
                ) : (
                  <p className="border-t pt-4 text-[13px] leading-5 text-muted-foreground">
                    Người này không còn được ghi nhận cho bạn. Liên hệ FireAnt nếu cần mở lại.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
