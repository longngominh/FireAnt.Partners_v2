CREATE OR ALTER PROCEDURE usp_ListCustomers
  @PartnerId  INT           = NULL,
  @Q          NVARCHAR(200) = NULL,   -- truyền dạng '%keyword%' từ app
  @Offset     INT           = 0,
  @PageSize   INT           = 20
AS
BEGIN
  SET NOCOUNT ON;

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu.
  SELECT
    o.UserName,
    u.Email,
    u.PhoneNumber,
    SUM(o.Amount)    AS TotalSpent,
    COUNT(o.OrderID) AS OrderCount,
    MIN(o.OrderDate) AS FirstOrderAt,
    MAX(o.OrderDate) AS LastOrderAt,
    (SELECT TOP 1 so2.StartDate
       FROM vw_PaidOrders so2
      WHERE so2.UserName = o.UserName
      ORDER BY so2.OrderDate DESC)                     AS MemberStartDate,
    (SELECT TOP 1 so2.EndDate
       FROM vw_PaidOrders so2
      WHERE so2.UserName = o.UserName
      ORDER BY so2.OrderDate DESC)                     AS MemberEndDate,
    (SELECT TOP 1 so2.PackageName
       FROM vw_PaidOrders so2
      WHERE so2.UserName = o.UserName
      ORDER BY so2.OrderDate DESC)                     AS LatestPackage,
    pu.Name AS PartnerName
  FROM  Coupons cp
  CROSS APPLY (
    SELECT TOP (1)
      so.OrderID,
      so.OrderDate,
      so.UserName,
      so.PackageID,
      so.Amount
    FROM vw_PaidOrders so
    WHERE so.CouponCode = cp.CouponCode
    ORDER BY so.OrderDate DESC, so.OrderID DESC
  ) o
  LEFT  JOIN [NEWFA].[FireAnt_Identity].[dbo].[AspNetUsers]    u   ON u.UserName    = o.UserName
  LEFT  JOIN Partners                                          p   ON p.PartnerId   = cp.PartnerId
  LEFT  JOIN [NEWFA].[FireAnt_Identity].[dbo].[AspNetUsers]    pu  ON pu.UserName     = p.UserName
  WHERE cp.IsUsed = 1
    AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Q IS NULL OR o.UserName LIKE @Q OR ISNULL(u.Email,'') LIKE @Q OR ISNULL(u.PhoneNumber,'') LIKE @Q)
  GROUP BY o.UserName, u.Email, u.PhoneNumber, pu.Name
  ORDER BY MAX(o.OrderDate) DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
