CREATE OR ALTER PROCEDURE usp_ListCustomers
  @PartnerId  INT           = NULL,
  @Q          NVARCHAR(200) = NULL,   -- truyền dạng '%keyword%' từ app
  @Offset     INT           = 0,
  @PageSize   INT           = 20
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    o.UserName,
    u.Email,
    u.PhoneNumber,
    SUM(pkg.Amount)  AS TotalSpent,
    COUNT(o.OrderID) AS OrderCount,
    MIN(o.OrderDate) AS FirstOrderAt,
    MAX(o.OrderDate) AS LastOrderAt,
    (SELECT TOP 1 so2.StartDate
       FROM [EStocks_Data].[dbo].[service_Orders] so2
      WHERE so2.UserName = o.UserName AND so2.IsPaid = 1
      ORDER BY so2.OrderDate DESC)                     AS MemberStartDate,
    (SELECT TOP 1 so2.EndDate
       FROM [EStocks_Data].[dbo].[service_Orders] so2
      WHERE so2.UserName = o.UserName AND so2.IsPaid = 1
      ORDER BY so2.OrderDate DESC)                     AS MemberEndDate,
    (SELECT TOP 1 pkg2.PackageName
       FROM [EStocks_Data].[dbo].[service_Orders]   so2
       LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg2
             ON so2.PackageID = pkg2.PackageID
      WHERE so2.UserName = o.UserName AND so2.IsPaid = 1
      ORDER BY so2.OrderDate DESC)                     AS LatestPackage,
    pu.Name AS PartnerName
  FROM  Coupons cp
  INNER JOIN [EStocks_Data].[dbo].[service_Orders]             o   ON o.CouponCode  = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages]           pkg ON o.PackageID   = pkg.PackageID
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
