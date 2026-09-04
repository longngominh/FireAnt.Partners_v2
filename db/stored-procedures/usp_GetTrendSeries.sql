CREATE OR ALTER PROCEDURE usp_GetTrendSeries
  @PartnerId INT      = NULL,
  @Since     DATETIME = NULL,   -- NULL = lấy toàn bộ lịch sử
  @IsDaily   BIT      = 0,      -- 1 = theo ngày (1W/1M), 0 = theo tháng (3M+)
  @ActiveOnly BIT     = 0
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
    SUM(o.Amount)                                                     AS Revenue
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
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
