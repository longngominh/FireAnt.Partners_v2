-- =============================================================================
-- vw_PaidOrders — đơn đã thanh toán dùng chung cho toàn bộ báo cáo doanh thu.
--
-- 1. "Đã thanh toán" = IsPaid = 1. Không dùng Status: service_ProcessOrder set
--    Status = 1 + IsPaid = 1 cho đơn thường, nhưng service_ProcessUpgradeOrder
--    (nâng cấp tự phục vụ) set Status = 6 + IsPaid = 1, nên lọc Status = 1 sẽ bỏ sót.
-- 2. Amount là DOANH THU THỰC THU của đơn, không phải giá niêm yết hiện tại:
--    - Giá gói lấy theo ngày đặt đơn (OrderDate) từ EStocks_Data.dbo.service_PackagePrices.
--      Giá gói từng bị sửa tại chỗ (09/04/2026) mà service_Orders không lưu giá lúc mua;
--      OrderDate vì số tiền chốt lúc tạo đơn (QR, tài khoản định danh, giao dịch store).
--    - Đơn nâng cấp tự phục vụ (có UpgradeAmount, Status 6): chỉ phần chênh.
--    - Đơn bị nâng cấp: service_Upgrade sửa thẳng đơn gốc sang gói mới và ghi phần chênh
--      vào service_Upgrades theo OrderID đơn gốc. Tiền đơn gốc = giá gói khách mua ban đầu
--      (OldPackageID của dòng nâng cấp đầu tiên) − mã giảm giá + phần chênh các lần nâng
--      cấp do admin làm. Phần chênh của lần nâng cấp tự phục vụ đã nằm ở đơn Status 6 nên
--      không cộng lại — nhận dạng: cùng UserName, cùng cặp gói, cùng số tiền, đơn Status 6
--      kích hoạt trong vòng 60 giây quanh dòng nâng cấp (service_ProcessUpgradeOrder làm cả hai
--      trong một transaction).
--    - Mã khuyến mại: trừ service_DiscountVoucherUsages.DiscountAmount (tối đa 1 dòng/đơn —
--      UNIQUE OrderID; voucher tặng ngày ghi 0). Cùng công thức service_GetOrderWithUserInfo
--      mà webhook OnePay dùng để đối chiếu số tiền khách chuyển.
--    ListAmount = giá niêm yết của gói (gói hiện tại của đơn) tại ngày đặt đơn.
--
-- Mọi stored procedure tính doanh thu/hoa hồng phải đi qua view này để dashboard,
-- bảng kê tháng, danh sách CTV/khách hàng cho ra cùng một con số.
-- Sửa 14/10/2026: giá theo ngày đặt đơn, đơn bị nâng cấp giữ giá gói gốc, không đếm trùng
-- nâng cấp tự phục vụ (FireAnt.Admin_V3: docs/sql/2026-10-14-paid-orders-view-prices-upgrades.sql).
-- =============================================================================
CREATE OR ALTER VIEW vw_PaidOrders
AS
SELECT
  o.OrderID,
  o.OrderDate,
  o.StartDate,
  o.EndDate,
  o.UserName,
  o.CouponCode,
  o.PackageID,
  pkg.ServiceID,
  pkg.PackageName,
  ISNULL(lp.Amount, pkg.Amount) AS ListAmount,
  CASE
    WHEN o.UpgradeAmount IS NOT NULL
      THEN ROUND(o.UpgradeAmount, 0)
    WHEN fu.OldPackageID IS NOT NULL
      THEN ROUND(ISNULL(op.Amount, opk.Amount) - ISNULL(vu.DiscountAmount, 0) + ISNULL(upg.Amount, 0), 0)
    ELSE ISNULL(lp.Amount, ISNULL(pkg.Amount, 0)) - ISNULL(vu.DiscountAmount, 0)
  END AS Amount
FROM  [EStocks_Data].[dbo].[service_Orders] o
LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = o.PackageID
LEFT  JOIN [EStocks_Data].[dbo].[service_DiscountVoucherUsages] vu ON vu.OrderID = o.OrderID
-- giá gói của đơn tại ngày đặt
OUTER APPLY (
  SELECT TOP (1) h.Amount
  FROM [EStocks_Data].[dbo].[service_PackagePrices] h
  WHERE h.PackageID = o.PackageID AND h.ValidFrom <= o.OrderDate
  ORDER BY h.ValidFrom DESC, h.PriceID DESC
) lp
-- gói khách mua ban đầu, nếu đơn đã bị service_Upgrade đổi sang gói khác
OUTER APPLY (
  SELECT TOP (1) up.OldPackageID
  FROM [EStocks_Data].[dbo].[service_Upgrades] up
  WHERE up.OrderID = o.OrderID
  ORDER BY up.Permdate, up.ID
) fu
LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] opk ON opk.PackageID = fu.OldPackageID
OUTER APPLY (
  SELECT TOP (1) h.Amount
  FROM [EStocks_Data].[dbo].[service_PackagePrices] h
  WHERE h.PackageID = fu.OldPackageID AND h.ValidFrom <= o.OrderDate
  ORDER BY h.ValidFrom DESC, h.PriceID DESC
) op
-- phần chênh các lần nâng cấp không có đơn tự phục vụ riêng (admin nâng cấp)
OUTER APPLY (
  SELECT SUM(up.Amount) AS Amount
  FROM [EStocks_Data].[dbo].[service_Upgrades] up
  WHERE up.OrderID = o.OrderID
    AND NOT EXISTS (
      SELECT 1
      FROM [EStocks_Data].[dbo].[service_Orders] o6
      WHERE o6.UserName = up.Username
        AND o6.IsPaid = 1
        AND o6.UpgradeAmount IS NOT NULL
        AND o6.UpgradeFromPackageID = up.OldPackageID
        AND o6.PackageID = up.NewPackageID
        AND ABS(o6.UpgradeAmount - up.Amount) < 1
        AND o6.StartDate >= DATEADD(second, -60, up.Permdate)
        AND o6.StartDate < DATEADD(second, 60, up.Permdate)
    )
) upg
WHERE o.IsPaid = 1;
