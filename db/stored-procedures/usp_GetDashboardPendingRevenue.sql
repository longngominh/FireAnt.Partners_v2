CREATE OR ALTER PROCEDURE usp_GetDashboardPendingRevenue
  @PartnerId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT ISNULL(SUM(pkg.Amount), 0) AS PendingRevenue
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = COALESCE(
    o.PackageID,
    TRY_CAST(SUBSTRING(
      cp.PaymentLink,
      CHARINDEX('packageId=', cp.PaymentLink) + 10,
      CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('packageId=', cp.PaymentLink) + 10)
        - (CHARINDEX('packageId=', cp.PaymentLink) + 10)
    ) AS INT)
  )
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed    = 0
    AND o.OrderID   IS NULL
    AND cp.ExpireDate >= GETDATE();
END;
