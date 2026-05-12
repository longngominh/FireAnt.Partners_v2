CREATE OR ALTER PROCEDURE usp_ListPartners
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    p.PartnerId,
    i.UserName, i.Email, i.Name, i.PhoneNumber,
    p.IsActive,
    p.CreatedDate,
    po.UnderDiscountRate, po.AboveDiscountRate, po.RevenueReference,
    ISNULL(stats.TotalRevenue,  0) AS TotalRevenue,
    ISNULL(stats.CouponCount,   0) AS CouponCount,
    ISNULL(stats.CustomerCount, 0) AS CustomerCount
  FROM Partners p
  LEFT  JOIN Policies po                              ON p.PolicyId = po.PolicyId
  INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserName = i.UserName
  LEFT JOIN (
    SELECT
      cp.PartnerId,
      ISNULL(SUM(CASE WHEN cp.IsUsed = 1 THEN pkg.Amount ELSE 0 END), 0)  AS TotalRevenue,
      COUNT(*)                                                              AS CouponCount,
      COUNT(DISTINCT CASE WHEN cp.IsUsed = 1 THEN o.UserName END)          AS CustomerCount
    FROM  Coupons cp
    LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
    LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
    GROUP BY cp.PartnerId
  ) stats ON p.PartnerId = stats.PartnerId
  WHERE p.IsActive = 1
  ORDER BY p.PartnerId;
END;
