CREATE OR ALTER PROCEDURE usp_GetPartnerStats
  @PartnerId  INT      = NULL,
  @Since      DATETIME = NULL,
  @ActiveOnly BIT      = 0
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
    ISNULL(SUM(CASE WHEN cp.IsUsed = 1 THEN pkg.Amount ELSE 0 END), 0)                       AS TotalRevenue,
    COUNT(DISTINCT CASE WHEN cp.IsUsed = 1 THEN o.UserName END)                               AS CustomerCount
  FROM  Coupons cp
  LEFT  JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.OrderID = poi.OrderID
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
  LEFT  JOIN Partners p ON p.PartnerId = cp.PartnerId
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Since IS NULL OR cp.CreatedDate >= @Since)
    AND (@ActiveOnly = 0 OR p.IsActive = 1);
END;
