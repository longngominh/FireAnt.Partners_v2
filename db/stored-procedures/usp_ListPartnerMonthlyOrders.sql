CREATE OR ALTER PROCEDURE usp_ListPartnerMonthlyOrders
  @MonthStart DATETIME,
  @MonthEnd   DATETIME           -- exclusive: 00:00 ngày 1 tháng kế tiếp
AS
BEGIN
  SET NOCOUNT ON;

  -- Bảng kê từng đơn đã thanh toán của mọi CTV trong tháng — cùng cách chọn đơn
  -- với usp_GetPartnerMonthlyRevenue (mỗi coupon IsUsed = 1 lấy đơn thanh toán
  -- mới nhất, quy về tháng theo OrderDate) để tổng từng CTV khớp bảng kê tháng.
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      cp.PartnerId,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
    GROUP BY cp.CouponID, cp.PartnerId
  )
  SELECT
    poi.PartnerId,
    o.OrderID,
    o.OrderDate,
    o.CouponCode,
    o.UserName    AS CustomerUserName,
    o.PackageName,
    o.ListAmount,
    o.Amount
  FROM  PaidOrderIds poi
  INNER JOIN vw_PaidOrders o ON o.OrderID = poi.OrderID
  WHERE o.OrderDate >= @MonthStart
    AND o.OrderDate <  @MonthEnd
  ORDER BY poi.PartnerId, o.OrderDate, o.OrderID;
END;
