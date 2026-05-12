CREATE OR ALTER PROCEDURE usp_GetDashboardAllStats
  @PartnerId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    COUNT(*)                                                                                  AS GeneratedLinks,
    SUM(CASE WHEN cp.IsUsed = 1 THEN 1 ELSE 0 END)                                           AS PaidLinks,
    SUM(CASE WHEN cp.IsUsed = 0 AND o.OrderID IS NULL AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END) AS PendingLinks,
    SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate < GETDATE() THEN 1 ELSE 0 END)              AS ExpiredLinks
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.CouponCode = cp.CouponCode
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId);
END;
