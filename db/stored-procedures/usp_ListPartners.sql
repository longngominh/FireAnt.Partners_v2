CREATE OR ALTER PROCEDURE usp_ListPartners
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
    GROUP BY cp.CouponID
  ),
  MonthlyPaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN [EStocks_Data].[dbo].[service_Orders] so
      ON so.CouponCode = cp.CouponCode
     AND so.Status = 1
    WHERE cp.IsUsed = 1
      AND so.OrderDate >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
      AND so.OrderDate <  DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
    GROUP BY cp.CouponID
  )
  SELECT
    p.PartnerId,
    i.UserName, i.Email, i.Name, i.PhoneNumber,
    p.IsActive,
    p.PartnerType,
    p.CreatedDate,
    po.UnderDiscountRate, po.AboveDiscountRate, po.RevenueReference,
    ISNULL(stats.TotalRevenue,  0) AS TotalRevenue,
    ISNULL(monthly.MonthlyRevenue, 0) AS MonthlyRevenue,
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
    LEFT  JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
    LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.OrderID = poi.OrderID
    LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
    GROUP BY cp.PartnerId
  ) stats ON p.PartnerId = stats.PartnerId
  LEFT JOIN (
    SELECT
      cp.PartnerId,
      ISNULL(SUM(pkg.Amount), 0) AS MonthlyRevenue
    FROM Coupons cp
    INNER JOIN MonthlyPaidOrderIds poi ON poi.CouponID = cp.CouponID
    INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.OrderID = poi.OrderID
    LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID = pkg.PackageID
    GROUP BY cp.PartnerId
  ) monthly ON p.PartnerId = monthly.PartnerId
  ORDER BY p.PartnerId;
END;
