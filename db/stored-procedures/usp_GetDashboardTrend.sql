CREATE OR ALTER PROCEDURE usp_GetDashboardTrend
  @PartnerId INT      = NULL,
  @Since     DATETIME
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
    FORMAT(o.OrderDate, 'yyyy-MM') AS Month,
    SUM(o.Amount)                  AS Revenue
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed    = 1
    AND o.OrderDate >= @Since
  GROUP BY FORMAT(o.OrderDate, 'yyyy-MM')
  ORDER BY Month;
END;
