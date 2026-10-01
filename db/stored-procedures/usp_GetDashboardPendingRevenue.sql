CREATE OR ALTER PROCEDURE usp_GetDashboardPendingRevenue
  @PartnerId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- Giá gói trong link trừ khoản giảm của mã khuyến mại (Coupons.DiscountAmount) nếu có.
  SELECT ISNULL(SUM(pkg.Amount - ISNULL(cp.DiscountAmount, 0)), 0) AS PendingRevenue
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = TRY_CAST(SUBSTRING(
      cp.PaymentLink,
      CHARINDEX('packageId=', cp.PaymentLink) + 10,
      CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('packageId=', cp.PaymentLink) + 10)
        - (CHARINDEX('packageId=', cp.PaymentLink) + 10)
    ) AS INT)
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed    = 0
    AND cp.ExpireDate >= GETDATE();
END;
