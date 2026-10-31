import { TriangleAlertIcon } from "lucide-react";
import { formatDay } from "@/lib/utils/month";

/** Nhân viên đã bị ngừng hợp tác: vẫn xem được lịch sử, không tạo được link mới. */
export function StaffEndedNotice({ partnerName, endDate }: { partnerName: string; endDate: Date | null }) {
  return (
    <div role="status" className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
      <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="flex flex-col gap-1 text-sm leading-6">
        <span className="font-semibold">
          Bạn đã ngừng được ghi nhận cho đối tác {partnerName} từ {formatDay(endDate)}
        </span>
        <span className="text-muted-foreground">
          Bạn vẫn xem được link, khách và doanh số tới ngày này nhưng không tạo được link mới. Link đang chờ thanh toán vẫn
          dùng được nhưng không còn tính cho đối tác.
        </span>
      </div>
    </div>
  );
}
