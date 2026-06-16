CREATE OR ALTER PROCEDURE usp_GetDashboardTrend
  @PartnerId INT      = NULL,
  @Since     DATETIME
AS
BEGIN
  SET NOCOUNT ON;

  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN [EStocks_Data].[dbo].[service_Orders] so
      ON so.CouponCode = cp.CouponCode
     AND so.Status = 1
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    GROUP BY cp.CouponID
  )
  SELECT
    FORMAT(o.OrderDate, 'yyyy-MM') AS Month,
    SUM(pkg.Amount)                AS Revenue
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.OrderID = poi.OrderID
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed    = 1
    AND o.OrderDate >= @Since
  GROUP BY FORMAT(o.OrderDate, 'yyyy-MM')
  ORDER BY Month;
END;
