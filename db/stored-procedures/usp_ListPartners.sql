CREATE OR ALTER PROCEDURE usp_ListPartners
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @MonthStart DATETIME = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);
  DECLARE @MonthEnd   DATETIME = DATEADD(MONTH, 1, @MonthStart);

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu.
  --
  -- Bản cũ đọc vw_PaidOrders 4 lần (PaidOrderIds, MonthlyPaidOrderIds và 2 lần join
  -- lấy Amount) → ~600ms. Ở đây xác định đơn đã thanh toán mới nhất của mỗi coupon
  -- MỘT lần (PaidByCoupon), lấy Amount/OrderDate/UserName của đơn đó (PaidDetail),
  -- rồi suy ra cả doanh thu cộng dồn và doanh thu tháng này từ cùng một tập → ~120ms.
  --
  -- Doanh thu tháng: bản cũ lấy MAX(OrderID) trong số đơn thuộc tháng hiện tại;
  -- vì tháng hiện tại là mốc muộn nhất nên đơn mới nhất của coupon rơi vào tháng này
  -- khi và chỉ khi coupon có đơn trong tháng này → cùng kết quả.
  WITH PaidByCoupon AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
    GROUP BY cp.CouponID
  ),
  PaidDetail AS (
    SELECT pbc.CouponID, o.Amount, o.OrderDate, o.UserName
    FROM PaidByCoupon pbc
    INNER JOIN vw_PaidOrders o ON o.OrderID = pbc.OrderID
  ),
  Stats AS (
    SELECT
      cp.PartnerId,
      COUNT(*)                                                    AS CouponCount,
      ISNULL(SUM(pd.Amount), 0)                                   AS TotalRevenue,
      COUNT(DISTINCT pd.UserName)                                 AS CustomerCount,
      ISNULL(SUM(CASE WHEN pd.OrderDate >= @MonthStart
                       AND pd.OrderDate <  @MonthEnd
                      THEN pd.Amount END), 0)                     AS MonthlyRevenue
    FROM Coupons cp
    LEFT JOIN PaidDetail pd ON pd.CouponID = cp.CouponID
    GROUP BY cp.PartnerId
  )
  SELECT
    p.PartnerId,
    i.UserName, i.Email, i.Name, i.PhoneNumber,
    p.IsActive,
    p.PartnerType,
    p.CreatedDate,
    po.UnderDiscountRate, po.AboveDiscountRate, po.RevenueReference,
    ISNULL(s.TotalRevenue,   0) AS TotalRevenue,
    ISNULL(s.MonthlyRevenue, 0) AS MonthlyRevenue,
    ISNULL(s.CouponCount,    0) AS CouponCount,
    ISNULL(s.CustomerCount,  0) AS CustomerCount
  FROM Partners p
  LEFT  JOIN Policies po                              ON p.PolicyId = po.PolicyId
  INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserName = i.UserName
  LEFT  JOIN Stats s                                  ON s.PartnerId = p.PartnerId
  ORDER BY p.PartnerId;
END;
