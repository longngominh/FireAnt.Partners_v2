-- =============================================================================
-- vw_PaidOrders — đơn đã thanh toán dùng chung cho toàn bộ báo cáo doanh thu.
--
-- 1. "Đã thanh toán" = IsPaid = 1. Không dùng Status: service_ProcessOrder set
--    Status = 1 + IsPaid = 1 cho đơn thường, nhưng service_ProcessUpgradeOrder
--    (nâng cấp tự động) set Status = 6 + IsPaid = 1, nên lọc Status = 1 sẽ bỏ sót.
-- 2. Amount là DOANH THU THỰC THU của đơn, không phải giá niêm yết của gói:
--    - Đơn nâng cấp kiểu cũ: service_Orders.PackageID trỏ tới gói mới nhưng khách
--      chỉ trả phần chênh lệch. Số tiền đó nằm ở service_Upgrades (theo OrderID,
--      có thể nhiều dòng khi nâng cấp nối tiếp hoặc dòng điều chỉnh âm, nên cộng dồn).
--    - Đơn nâng cấp kiểu mới (từ 09/2026): phần chênh lệch ghi thẳng vào
--      service_Orders.UpgradeAmount (nếu sau đó nâng cấp tiếp thì có thêm dòng
--      service_Upgrades, cũng cộng dồn).
--    - Đơn thường: lấy giá gói service_Packages.Amount.
--    ListAmount giữ giá niêm yết để đối chiếu khi cần.
--
-- Mọi stored procedure tính doanh thu/hoa hồng phải đi qua view này để dashboard,
-- bảng kê tháng, danh sách CTV/khách hàng cho ra cùng một con số.
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
  pkg.Amount AS ListAmount,
  CASE
    WHEN o.UpgradeAmount IS NOT NULL OR upg.Amount IS NOT NULL
      THEN ROUND(ISNULL(o.UpgradeAmount, 0) + ISNULL(upg.Amount, 0), 0)
    ELSE ISNULL(pkg.Amount, 0)
  END AS Amount
FROM  [EStocks_Data].[dbo].[service_Orders]   o
LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = o.PackageID
OUTER APPLY (
  SELECT SUM(up.Amount) AS Amount
  FROM [EStocks_Data].[dbo].[service_Upgrades] up
  WHERE up.OrderID = o.OrderID
) upg
WHERE o.IsPaid = 1;
