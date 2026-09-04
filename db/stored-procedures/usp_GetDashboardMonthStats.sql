CREATE OR ALTER PROCEDURE usp_GetDashboardMonthStats
  @PartnerId  INT      = NULL,
  @MonthStart DATETIME,
  @MonthEnd   DATETIME
AS
BEGIN
  SET NOCOUNT ON;

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu.
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    GROUP BY cp.CouponID
  )
  SELECT
    COUNT(*)                       AS PaidLinks,
    ISNULL(SUM(o.Amount), 0)       AS TotalRevenue,
    -- Doanh thu khóa học (ServiceID = 39) tách riêng để dashboard hiển thị breakdown
    ISNULL(SUM(CASE WHEN o.ServiceID = 39 THEN o.Amount ELSE 0 END), 0) AS CourseRevenue,
    COUNT(DISTINCT o.UserName)     AS Customers
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed   = 1
    AND o.OrderDate >= @MonthStart
    AND o.OrderDate <  @MonthEnd;
END;
