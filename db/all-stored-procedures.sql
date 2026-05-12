-- =============================================================================
-- FireAnt Partners — Stored Procedures
-- Chạy file này trên SQL Server để tạo/cập nhật toàn bộ stored procedures.
-- Dùng CREATE OR ALTER nên có thể chạy lại nhiều lần mà không cần DROP trước.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- usp_CountCoupons
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_CountCoupons
  @PartnerId INT           = NULL,
  @Status    NVARCHAR(20)  = 'ALL',
  @Q         NVARCHAR(200) = NULL    -- truyền dạng '%keyword%' từ app
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS Total
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.CouponCode = cp.CouponCode
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (
      @Status = 'ALL'
      OR (@Status = 'PAID'    AND cp.IsUsed = 1)
      OR (@Status = 'USED'    AND o.OrderID IS NOT NULL AND cp.IsUsed = 0)
      OR (@Status = 'EXPIRED' AND cp.IsUsed = 0 AND cp.ExpireDate < GETDATE())
      OR (@Status = 'PENDING' AND cp.IsUsed = 0 AND o.OrderID IS NULL AND cp.ExpireDate >= GETDATE())
    )
    AND (@Q IS NULL OR cp.CouponCode LIKE @Q OR ISNULL(cp.UserName,'') LIKE @Q);
END;


-- ---------------------------------------------------------------------------
-- usp_CountCustomers
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_CountCustomers
  @PartnerId INT           = NULL,
  @Q         NVARCHAR(200) = NULL    -- truyền dạng '%keyword%' từ app
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(DISTINCT o.UserName) AS Total
  FROM  Coupons cp
  INNER JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [NEWFA].[FireAnt_Identity].[dbo].[AspNetUsers] u ON u.UserName = o.UserName
  WHERE cp.IsUsed = 1
    AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Q IS NULL OR o.UserName LIKE @Q OR ISNULL(u.Email,'') LIKE @Q OR ISNULL(u.PhoneNumber,'') LIKE @Q);
END;


-- ---------------------------------------------------------------------------
-- usp_CreateCoupon
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_CreateCoupon
  @PartnerId   INT,
  @CouponCode  NVARCHAR(50),
  @PaymentLink NVARCHAR(MAX),
  @UserName    NVARCHAR(256) = NULL,
  @Note        NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  INSERT INTO Coupons
    (PartnerId, CouponTypeId, CouponCode, IsUsed, CreatedDate, ExpireDate, PaymentLink, UserName, Note)
  VALUES
    (@PartnerId, 1, @CouponCode, 0, GETDATE(), DATEADD(day, 14, GETDATE()), @PaymentLink, @UserName, @Note);

  SELECT SCOPE_IDENTITY() AS CouponID;
END;


-- ---------------------------------------------------------------------------
-- usp_GetCouponByCode
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_GetCouponByCode
  @CouponCode NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    cp.CouponID,
    cp.CouponCode,
    cp.PaymentLink,
    cp.IsUsed,
    cp.IsUsed                                                             AS IsPaid,
    cp.CreatedDate,
    cp.ExpireDate,
    o.OrderID                                                             AS OrderId,
    o.OrderDate,
    ISNULL(pkg.Amount, 0)                                                 AS OrderAmount,
    COALESCE(
      o.UserName,
      CASE WHEN CHARINDEX('userName=', cp.PaymentLink) > 0 THEN
        SUBSTRING(
          cp.PaymentLink,
          CHARINDEX('userName=', cp.PaymentLink) + 9,
          CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('userName=', cp.PaymentLink) + 9)
            - (CHARINDEX('userName=', cp.PaymentLink) + 9)
        )
      ELSE NULL END
    )                                                                     AS CustomerName,
    pkg.PackageName,
    cp.UserName,
    cp.Note
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = COALESCE(
    o.PackageID,
    TRY_CAST(SUBSTRING(
      cp.PaymentLink,
      CHARINDEX('packageId=', cp.PaymentLink) + 10,
      CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('packageId=', cp.PaymentLink) + 10)
        - (CHARINDEX('packageId=', cp.PaymentLink) + 10)
    ) AS INT)
  )
  WHERE cp.CouponCode = @CouponCode;
END;


-- ---------------------------------------------------------------------------
-- usp_GetDashboardAllStats
-- ---------------------------------------------------------------------------
GO
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


-- ---------------------------------------------------------------------------
-- usp_GetDashboardMonthStats
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_GetDashboardMonthStats
  @PartnerId  INT      = NULL,
  @MonthStart DATETIME,
  @MonthEnd   DATETIME
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    COUNT(*)                       AS PaidLinks,
    ISNULL(SUM(pkg.Amount), 0)     AS TotalRevenue,
    COUNT(DISTINCT o.UserName)     AS Customers
  FROM  Coupons cp
  INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed   = 1
    AND o.OrderDate >= @MonthStart
    AND o.OrderDate <  @MonthEnd;
END;


-- ---------------------------------------------------------------------------
-- usp_GetDashboardPendingRevenue
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_GetDashboardPendingRevenue
  @PartnerId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT ISNULL(SUM(pkg.Amount), 0) AS PendingRevenue
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = COALESCE(
    o.PackageID,
    TRY_CAST(SUBSTRING(
      cp.PaymentLink,
      CHARINDEX('packageId=', cp.PaymentLink) + 10,
      CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('packageId=', cp.PaymentLink) + 10)
        - (CHARINDEX('packageId=', cp.PaymentLink) + 10)
    ) AS INT)
  )
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed    = 0
    AND o.OrderID   IS NULL
    AND cp.ExpireDate >= GETDATE();
END;


-- ---------------------------------------------------------------------------
-- usp_GetDashboardTrend
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_GetDashboardTrend
  @PartnerId INT      = NULL,
  @Since     DATETIME
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    FORMAT(o.OrderDate, 'yyyy-MM') AS Month,
    SUM(pkg.Amount)                AS Revenue
  FROM  Coupons cp
  INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed    = 1
    AND o.OrderDate >= @Since
  GROUP BY FORMAT(o.OrderDate, 'yyyy-MM')
  ORDER BY Month;
END;


-- ---------------------------------------------------------------------------
-- usp_GetPartner
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_GetPartner
  @PartnerId INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    p.PartnerId,
    i.UserName, i.Email, i.Name, i.PhoneNumber,
    p.IsActive,
    p.CreatedDate,
    po.UnderDiscountRate, po.AboveDiscountRate, po.RevenueReference
  FROM   Partners p
  LEFT  JOIN Policies po                              ON p.PolicyId = po.PolicyId
  INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserName = i.UserName
  WHERE  p.PartnerId = @PartnerId;
END;


-- ---------------------------------------------------------------------------
-- usp_GetPartnerStats
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_GetPartnerStats
  @PartnerId INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    COUNT(*)                                                                                  AS TotalCoupons,
    SUM(CASE WHEN cp.IsUsed = 1 THEN 1 ELSE 0 END)                                           AS PaidCoupons,
    SUM(CASE WHEN cp.IsUsed = 0 AND o.OrderID IS NULL AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END) AS PendingCoupons,
    ISNULL(SUM(CASE WHEN cp.IsUsed = 1 THEN pkg.Amount ELSE 0 END), 0)                       AS TotalRevenue,
    COUNT(DISTINCT CASE WHEN cp.IsUsed = 1 THEN o.UserName END)                               AS CustomerCount
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
  WHERE cp.PartnerId = @PartnerId;
END;


-- ---------------------------------------------------------------------------
-- usp_GetPartnerTrend
-- ---------------------------------------------------------------------------
GO
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


-- ---------------------------------------------------------------------------
-- usp_GetTrendSeries
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_GetTrendSeries
  @PartnerId INT      = NULL,
  @Since     DATETIME = NULL,   -- NULL = lấy toàn bộ lịch sử
  @IsDaily   BIT      = 0       -- 1 = theo ngày (1W/1M), 0 = theo tháng (3M+)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    CASE
      WHEN @IsDaily = 1 THEN FORMAT(o.OrderDate, 'yyyy-MM-dd')
      ELSE                    FORMAT(o.OrderDate, 'yyyy-MM')
    END                                                               AS Period,
    SUM(pkg.Amount)                                                   AS Revenue
  FROM  Coupons cp
  INNER JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON o.PackageID  = pkg.PackageID
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed = 1
    AND (@Since IS NULL OR cp.CreatedDate >= @Since)
  GROUP BY
    CASE
      WHEN @IsDaily = 1 THEN FORMAT(o.OrderDate, 'yyyy-MM-dd')
      ELSE                    FORMAT(o.OrderDate, 'yyyy-MM')
    END
  ORDER BY Period;
END;


-- ---------------------------------------------------------------------------
-- usp_ListCoupons
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_ListCoupons
  @PartnerId INT           = NULL,
  @Status    NVARCHAR(20)  = 'ALL',
  @Q         NVARCHAR(200) = NULL,   -- truyền dạng '%keyword%' từ app
  @Offset    INT           = 0,
  @PageSize  INT           = 20
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    cp.CouponID,
    cp.CouponCode,
    cp.PaymentLink,
    cp.IsUsed,
    cp.IsUsed                                                             AS IsPaid,
    cp.CreatedDate,
    cp.ExpireDate,
    o.OrderID                                                             AS OrderId,
    o.OrderDate,
    ISNULL(pkg.Amount, 0)                                                 AS OrderAmount,
    COALESCE(
      o.UserName,
      CASE WHEN CHARINDEX('userName=', cp.PaymentLink) > 0 THEN
        SUBSTRING(
          cp.PaymentLink,
          CHARINDEX('userName=', cp.PaymentLink) + 9,
          CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('userName=', cp.PaymentLink) + 9)
            - (CHARINDEX('userName=', cp.PaymentLink) + 9)
        )
      ELSE NULL END
    )                                                                     AS CustomerName,
    pkg.PackageName,
    cp.UserName,
    cp.Note
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders]   o   ON o.CouponCode = cp.CouponCode
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = COALESCE(
    o.PackageID,
    TRY_CAST(SUBSTRING(
      cp.PaymentLink,
      CHARINDEX('packageId=', cp.PaymentLink) + 10,
      CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('packageId=', cp.PaymentLink) + 10)
        - (CHARINDEX('packageId=', cp.PaymentLink) + 10)
    ) AS INT)
  )
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (
      @Status = 'ALL'
      OR (@Status = 'PAID'    AND cp.IsUsed = 1)
      OR (@Status = 'USED'    AND o.OrderID IS NOT NULL AND cp.IsUsed = 0)
      OR (@Status = 'EXPIRED' AND cp.IsUsed = 0 AND cp.ExpireDate < GETDATE())
      OR (@Status = 'PENDING' AND cp.IsUsed = 0 AND o.OrderID IS NULL AND cp.ExpireDate >= GETDATE())
    )
    AND (@Q IS NULL OR cp.CouponCode LIKE @Q OR ISNULL(o.UserName,'') LIKE @Q OR cp.PaymentLink LIKE @Q)
  ORDER BY cp.CreatedDate DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;


-- ---------------------------------------------------------------------------
-- usp_ListCustomers
-- ---------------------------------------------------------------------------
GO
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


-- ---------------------------------------------------------------------------
-- usp_ListPackages
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_ListPackages
AS
BEGIN
  SET NOCOUNT ON;

  SELECT PackageID, Months, Amount, PackageName
  FROM   [EStocks_Data].[dbo].[service_Packages]
  WHERE  PackageID IN (55, 43, 44, 45, 95, 96, 97, 98, 57, 49, 50, 51)
    AND  IsTrial = 0
  ORDER BY PackageID;
END;


-- ---------------------------------------------------------------------------
-- usp_ListPartners
-- ---------------------------------------------------------------------------
GO
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
  ORDER BY p.PartnerId;
END;


-- ---------------------------------------------------------------------------
-- usp_TogglePartnerActive
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_TogglePartnerActive
  @PartnerId INT,
  @IsActive  BIT
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE Partners
  SET    IsActive = @IsActive
  WHERE  PartnerId = @PartnerId;
END;

GO
-- =============================================================================
-- Hoàn tất. Tổng cộng 17 stored procedures đã được tạo/cập nhật.
-- =============================================================================
