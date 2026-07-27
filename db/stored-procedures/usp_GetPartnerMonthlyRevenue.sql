CREATE OR ALTER PROCEDURE usp_GetPartnerMonthlyRevenue
  @MonthStart DATETIME,
  @MonthEnd   DATETIME,          -- exclusive: 00:00 ngày 1 tháng kế tiếp
  @PartnerId  INT = NULL
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
  ),
  MonthlyByPartner AS (
    SELECT
      cp.PartnerId,
      ISNULL(SUM(pkg.Amount), 0) AS Revenue,
      COUNT(o.OrderID)           AS OrderCount,
      COUNT(DISTINCT o.UserName) AS CustomerCount,
      MAX(o.OrderDate)           AS LastOrderDate
    FROM  Coupons cp
    INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
    INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.OrderID   = poi.OrderID
    LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = o.PackageID
    WHERE cp.IsUsed = 1
      AND o.OrderDate >= @MonthStart
      AND o.OrderDate <  @MonthEnd
    GROUP BY cp.PartnerId
  )
  -- LEFT JOIN để CTV không phát sinh doanh thu trong tháng vẫn xuất hiện với số 0.
  SELECT
    p.PartnerId,
    i.UserName, i.Email, i.Name, i.PhoneNumber,
    p.IsActive,
    p.PartnerType,
    p.CreatedDate,
    ISNULL(m.Revenue, 0)       AS Revenue,
    ISNULL(m.OrderCount, 0)    AS OrderCount,
    ISNULL(m.CustomerCount, 0) AS CustomerCount,
    m.LastOrderDate
  FROM  Partners p
  INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserName = i.UserName
  LEFT  JOIN MonthlyByPartner m                       ON m.PartnerId = p.PartnerId
  WHERE (@PartnerId IS NULL OR p.PartnerId = @PartnerId)
  ORDER BY ISNULL(m.Revenue, 0) DESC, p.PartnerId;
END;
