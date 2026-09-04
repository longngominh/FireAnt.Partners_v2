CREATE OR ALTER PROCEDURE usp_GetPartnerMonthlyRevenue
  @MonthStart DATETIME,
  @MonthEnd   DATETIME,          -- exclusive: 00:00 ngày 1 tháng kế tiếp
  @PartnerId  INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu
  -- (đơn nâng cấp chỉ tính phần chênh lệch khách đã trả, không tính trọn giá gói).
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    GROUP BY cp.CouponID
  ),
  MonthlyByPartner AS (
    SELECT
      cp.PartnerId,
      ISNULL(SUM(o.Amount), 0)   AS Revenue,
      COUNT(o.OrderID)           AS OrderCount,
      COUNT(DISTINCT o.UserName) AS CustomerCount,
      MAX(o.OrderDate)           AS LastOrderDate
    FROM  Coupons cp
    INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
    INNER JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
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
