CREATE OR ALTER PROCEDURE usp_GetTrendSeries
  @PartnerId INT      = NULL,
  @Since     DATETIME = NULL,   -- NULL = lấy toàn bộ lịch sử
  @IsDaily   BIT      = 0,      -- 1 = theo ngày (1W/1M), 0 = theo tháng (3M+)
  @ActiveOnly BIT     = 0
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
    LEFT JOIN Partners p ON p.PartnerId = cp.PartnerId
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
      AND (@Since IS NULL OR cp.CreatedDate >= @Since)
      AND (@ActiveOnly = 0 OR p.IsActive = 1)
    GROUP BY cp.CouponID
  )
  SELECT
    CASE
      WHEN @IsDaily = 1 THEN FORMAT(o.OrderDate, 'yyyy-MM-dd')
      ELSE                    FORMAT(o.OrderDate, 'yyyy-MM')
    END                                                               AS Period,
    SUM(pkg.Amount)                                                   AS Revenue
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.OrderID = poi.OrderID
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
  LEFT  JOIN Partners p ON p.PartnerId = cp.PartnerId
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed = 1
    AND (@Since IS NULL OR cp.CreatedDate >= @Since)
    AND (@ActiveOnly = 0 OR p.IsActive = 1)
  GROUP BY
    CASE
      WHEN @IsDaily = 1 THEN FORMAT(o.OrderDate, 'yyyy-MM-dd')
      ELSE                    FORMAT(o.OrderDate, 'yyyy-MM')
    END
  ORDER BY Period;
END;
