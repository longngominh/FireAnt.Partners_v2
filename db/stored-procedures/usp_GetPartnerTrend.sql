CREATE OR ALTER PROCEDURE usp_GetPartnerTrend
  @PartnerId INT
AS
BEGIN
  SET NOCOUNT ON;

  -- Trả về 6 tháng gần nhất có doanh thu, sắp xếp DESC để gọi .reverse() phía app
  SELECT TOP 6
    FORMAT(o.OrderDate, 'yyyy-MM') AS Month,
    SUM(pkg.Amount)                AS Revenue
  FROM  Coupons cp
  INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
  WHERE cp.PartnerId = @PartnerId
    AND cp.IsUsed    = 1
  GROUP BY FORMAT(o.OrderDate, 'yyyy-MM')
  ORDER BY Month DESC;
END;
