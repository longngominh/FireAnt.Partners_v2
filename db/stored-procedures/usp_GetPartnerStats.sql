CREATE OR ALTER PROCEDURE usp_GetPartnerStats
  @PartnerId  INT      = NULL,
  @Since      DATETIME = NULL,
  @ActiveOnly BIT      = 0
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
    WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
      AND cp.IsUsed = 1
      AND (@Since IS NULL OR cp.CreatedDate >= @Since)
      AND (@ActiveOnly = 0 OR p.IsActive = 1)
    GROUP BY cp.CouponID
  )
  SELECT
    COUNT(*)                                                                                  AS TotalCoupons,
    SUM(CASE WHEN cp.IsUsed = 1 THEN 1 ELSE 0 END)                                           AS PaidCoupons,
    SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END)             AS PendingCoupons,
    ISNULL(SUM(CASE WHEN cp.IsUsed = 1 THEN o.Amount ELSE 0 END), 0)                         AS TotalRevenue,
    COUNT(DISTINCT CASE WHEN cp.IsUsed = 1 THEN o.UserName END)                               AS CustomerCount
  FROM  Coupons cp
  LEFT  JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  LEFT  JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
  LEFT  JOIN Partners p ON p.PartnerId = cp.PartnerId
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Since IS NULL OR cp.CreatedDate >= @Since)
    AND (@ActiveOnly = 0 OR p.IsActive = 1);
END;
