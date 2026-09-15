-- =============================================================================
-- FireAnt Partners — Stored Procedures
-- Chạy file này trên SQL Server để tạo/cập nhật toàn bộ stored procedures.
-- Dùng CREATE OR ALTER nên có thể chạy lại nhiều lần mà không cần DROP trước.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- vw_PaidOrders (view)
-- ---------------------------------------------------------------------------
GO
-- =============================================================================
-- vw_PaidOrders — đơn đã thanh toán dùng chung cho toàn bộ báo cáo doanh thu.
--
-- 1. "Đã thanh toán" = IsPaid = 1. Không dùng Status: service_ProcessOrder set
--    Status = 1 + IsPaid = 1 cho đơn thường, nhưng service_ProcessUpgradeOrder
--    (nâng cấp tự động) set Status = 6 + IsPaid = 1, nên lọc Status = 1 sẽ bỏ sót.
-- 2. Amount là DOANH THU THỰC THU của đơn, không phải giá niêm yết của gói:
--    - Đơn nâng cấp kiểu cũ: service_Orders.PackageID trỏ tới gói mới nhưng khách
--      chỉ trả phần chênh lệch. Số tiền đó nằm ở service_Upgrades (theo OrderID,
--      có thể nhiều dòng khi nâng cấp nối tiếp hoặc dòng điều chỉnh âm, nên cộng dồn).
--    - Đơn nâng cấp kiểu mới (từ 09/2026): phần chênh lệch ghi thẳng vào
--      service_Orders.UpgradeAmount (nếu sau đó nâng cấp tiếp thì có thêm dòng
--      service_Upgrades, cũng cộng dồn).
--    - Đơn thường: lấy giá gói service_Packages.Amount.
--    ListAmount giữ giá niêm yết để đối chiếu khi cần.
--
-- Mọi stored procedure tính doanh thu/hoa hồng phải đi qua view này để dashboard,
-- bảng kê tháng, danh sách CTV/khách hàng cho ra cùng một con số.
-- =============================================================================
CREATE OR ALTER VIEW vw_PaidOrders
AS
SELECT
  o.OrderID,
  o.OrderDate,
  o.StartDate,
  o.EndDate,
  o.UserName,
  o.CouponCode,
  o.PackageID,
  pkg.ServiceID,
  pkg.PackageName,
  pkg.Amount AS ListAmount,
  CASE
    WHEN o.UpgradeAmount IS NOT NULL OR upg.Amount IS NOT NULL
      THEN ROUND(ISNULL(o.UpgradeAmount, 0) + ISNULL(upg.Amount, 0), 0)
    ELSE ISNULL(pkg.Amount, 0)
  END AS Amount
FROM  [EStocks_Data].[dbo].[service_Orders]   o
LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = o.PackageID
OUTER APPLY (
  SELECT SUM(up.Amount) AS Amount
  FROM [EStocks_Data].[dbo].[service_Upgrades] up
  WHERE up.OrderID = o.OrderID
) upg
WHERE o.IsPaid = 1;


-- ---------------------------------------------------------------------------
-- usp_CountCoupons
-- ---------------------------------------------------------------------------
GO

GO
CREATE OR ALTER PROCEDURE usp_CountCoupons
  @PartnerId INT           = NULL,
  @Status    NVARCHAR(20)  = 'ALL',
  @Q         NVARCHAR(200) = NULL    -- truyền dạng '%keyword%' từ app
AS
BEGIN
  SET NOCOUNT ON;

  -- PaidByCoupon: xem chú thích trong usp_ListCoupons (tính một lần, không tra từng coupon).
  WITH PaidByCoupon AS (
    SELECT o.CouponCode, MAX(o.OrderID) AS OrderID
    FROM [EStocks_Data].[dbo].[service_Orders] o
    WHERE o.IsPaid = 1 AND o.CouponCode IS NOT NULL
    GROUP BY o.CouponCode
  ),
  PaidUserMatch AS (
    SELECT p.CouponCode
    FROM PaidByCoupon p
    INNER JOIN [EStocks_Data].[dbo].[service_Orders] so ON so.OrderID = p.OrderID
    WHERE @Q IS NOT NULL AND ISNULL(so.UserName, '') LIKE @Q
  )
  SELECT COUNT(*) AS Total
  FROM  Coupons cp
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (
      @Status = 'ALL'
      OR (@Status = 'PAID'    AND cp.IsUsed = 1)
      OR (@Status = 'USED'    AND cp.IsUsed = 0 AND EXISTS (
        SELECT 1 FROM PaidByCoupon p WHERE p.CouponCode = cp.CouponCode
      ))
      OR (@Status = 'EXPIRED' AND cp.IsUsed = 0 AND cp.ExpireDate < GETDATE())
      OR (@Status = 'PENDING' AND cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() AND NOT EXISTS (
        SELECT 1 FROM PaidByCoupon p WHERE p.CouponCode = cp.CouponCode
      ))
    )
    AND (
      @Q IS NULL
      OR cp.CouponCode LIKE @Q
      OR ISNULL(cp.UserName,'') LIKE @Q
      OR cp.CouponCode IN (SELECT m.CouponCode FROM PaidUserMatch m)
    );
END;




-- ---------------------------------------------------------------------------
-- usp_CountCustomers
-- ---------------------------------------------------------------------------
GO
-- =============================================================================
-- usp_CountCustomers — tổng số dòng cho /customers.
--
-- 2026-09-15: viết lại theo đúng cách dựng ứng viên của usp_ListCustomers (xem chú thích
-- hiệu năng đầy đủ ở file đó) — bản cũ dùng CROSS APPLY TOP(1) trên vw_PaidOrders cho từng
-- coupon + LEFT JOIN AspNetUsers qua linked server nên vượt 15s.
--
-- SỬA LUÔN MỘT SAI LỆCH: bản cũ đếm COUNT(DISTINCT UserName) trong khi usp_ListCustomers
-- trả MỘT DÒNG cho mỗi (khách × đối tác). Với admin, khách mua qua hai CTV cho hai dòng
-- nhưng chỉ được đếm một → phân trang thiếu trang. Nay đếm đúng số dòng danh sách trả về.
--
-- Trang /customers KHÔNG gọi proc này nữa (lấy tổng qua @Total của usp_ListCustomers để
-- khỏi dựng lại tập ứng viên lần hai); giữ lại cho các chỗ chỉ cần con số.
-- =============================================================================
CREATE OR ALTER PROCEDURE usp_CountCustomers
  @PartnerId INT           = NULL,
  @Q         NVARCHAR(200) = NULL    -- truyền dạng '%keyword%' từ app
AS
BEGIN
  SET NOCOUNT ON;

  CREATE TABLE #co (OrderID INT PRIMARY KEY, PartnerId INT);

  WITH PaidByCoupon AS (
    SELECT o.CouponCode, MAX(o.OrderID) AS OrderID
    FROM [EStocks_Data].[dbo].[service_Orders] o
    WHERE o.IsPaid = 1 AND o.CouponCode IS NOT NULL
    GROUP BY o.CouponCode
  )
  INSERT INTO #co (OrderID, PartnerId)
  SELECT p.OrderID, cp.PartnerId
  FROM  Coupons cp
  INNER JOIN PaidByCoupon p ON p.CouponCode = cp.CouponCode
  WHERE cp.IsUsed = 1
    AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId);

  SELECT o.UserName, c.PartnerId
  INTO   #agg
  FROM   #co c
  INNER JOIN vw_PaidOrders o ON o.OrderID = c.OrderID
  GROUP BY o.UserName, c.PartnerId;

  IF (@Q IS NULL)
  BEGIN
    SELECT COUNT(*) AS Total FROM #agg;
  END
  ELSE
  BEGIN
    SELECT DISTINCT UserName INTO #uall FROM #agg;

    SELECT u.UserName, a.Email, a.PhoneNumber
    INTO   #info
    FROM   #uall u
    INNER REMOTE JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers a ON a.UserName = u.UserName;

    SELECT COUNT(*) AS Total
    FROM   #agg a
    LEFT   JOIN #info i ON i.UserName = a.UserName
    WHERE  a.UserName LIKE @Q
        OR ISNULL(i.Email, '')       LIKE @Q
        OR ISNULL(i.PhoneNumber, '') LIKE @Q;

    DROP TABLE #info;
    DROP TABLE #uall;
  END

  DROP TABLE #agg;
  DROP TABLE #co;
END;


-- ---------------------------------------------------------------------------
-- usp_CountPaidOrdersWithoutAccount
-- ---------------------------------------------------------------------------
GO
-- Chỉ đếm — dùng cho badge trên /payment (trang đó không cần danh sách).
-- Trang /payment/pending-account KHÔNG gọi proc này: nó lấy tổng qua @Total của proc trên
-- để chỉ dựng tập ứng viên một lần.
CREATE OR ALTER PROCEDURE usp_CountPaidOrdersWithoutAccount
  @PartnerId INT           = NULL,
  @Q         NVARCHAR(200) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  CREATE TABLE #cand (OrderID INT PRIMARY KEY, UserName NVARCHAR(256));

  WITH PaidByCoupon AS (
    SELECT o.CouponCode, MAX(o.OrderID) AS OrderID
    FROM [EStocks_Data].[dbo].[service_Orders] o
    WHERE o.IsPaid = 1 AND o.CouponCode IS NOT NULL
    GROUP BY o.CouponCode
  )
  INSERT INTO #cand (OrderID, UserName)
  SELECT so.OrderID, so.UserName
  FROM  Coupons cp
  INNER JOIN PaidByCoupon p                            ON p.CouponCode = cp.CouponCode
  INNER JOIN [EStocks_Data].[dbo].[service_Orders] so  ON so.OrderID   = p.OrderID
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Q IS NULL OR ISNULL(so.UserName, '') LIKE @Q OR cp.CouponCode LIKE @Q);

  SELECT c.OrderID
  INTO   #has
  FROM   #cand c
  INNER REMOTE JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers u ON u.UserName = c.UserName;

  SELECT COUNT(*) AS Total
  FROM   #cand c
  WHERE  NOT EXISTS (SELECT 1 FROM #has h WHERE h.OrderID = c.OrderID);

  DROP TABLE #has;
  DROP TABLE #cand;
END;


-- ---------------------------------------------------------------------------
-- usp_CreateCoupon
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_CreateCoupon
  @PartnerId   INT,
  @CouponCode  NVARCHAR(50),
  @PaymentLink NVARCHAR(MAX),
  @PackageId   INT = NULL,
  @UserName    NVARCHAR(256) = NULL,
  @Note        NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  INSERT INTO Coupons
    (PartnerId, CouponTypeId, CouponCode, IsUsed, CreatedDate, ExpireDate, PaymentLink, PackageId, UserName, Note)
  VALUES
    (@PartnerId, 1, @CouponCode, 0, GETDATE(), DATEADD(day, 14, GETDATE()), @PaymentLink, @PackageId, @UserName, @Note);

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

  -- Đơn đã thanh toán mới nhất của coupon: lấy MAX(OrderID) theo CouponCode rồi
  -- đọc vw_PaidOrders theo OrderID (PK) — tránh mẫu TOP (1) ORDER BY OrderDate
  -- khiến SQL Server quét ngược index OrderDate (xem chú thích usp_ListCoupons).
  DECLARE @OrderID INT;
  SELECT @OrderID = MAX(o.OrderID)
  FROM [EStocks_Data].[dbo].[service_Orders] o
  WHERE o.CouponCode = @CouponCode AND o.IsPaid = 1;

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
    -- Đã thanh toán: số thực thu của đơn; chưa thanh toán: giá gói trong link.
    COALESCE(o.Amount, pkg.Amount, 0)                                     AS OrderAmount,
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
  LEFT  JOIN vw_PaidOrders o ON o.OrderID = @OrderID
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
    SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END)             AS PendingLinks,
    SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate < GETDATE() THEN 1 ELSE 0 END)              AS ExpiredLinks
  FROM  Coupons cp
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

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu.
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    GROUP BY cp.CouponID
  )
  SELECT
    COUNT(*)                       AS PaidLinks,
    ISNULL(SUM(o.Amount), 0)       AS TotalRevenue,
    -- Doanh thu khóa học (ServiceID = 39) tách riêng để dashboard hiển thị breakdown
    ISNULL(SUM(CASE WHEN o.ServiceID = 39 THEN o.Amount ELSE 0 END), 0) AS CourseRevenue,
    COUNT(DISTINCT o.UserName)     AS Customers
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
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
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = TRY_CAST(SUBSTRING(
      cp.PaymentLink,
      CHARINDEX('packageId=', cp.PaymentLink) + 10,
      CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('packageId=', cp.PaymentLink) + 10)
        - (CHARINDEX('packageId=', cp.PaymentLink) + 10)
    ) AS INT)
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed    = 0
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

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu.
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    GROUP BY cp.CouponID
  )
  SELECT
    FORMAT(o.OrderDate, 'yyyy-MM') AS Month,
    SUM(o.Amount)                  AS Revenue
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
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
    p.PartnerType,
    p.CreatedDate,
    po.UnderDiscountRate, po.AboveDiscountRate, po.RevenueReference
  FROM   Partners p
  LEFT  JOIN Policies po                              ON p.PolicyId = po.PolicyId
  INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserName = i.UserName
  WHERE  p.PartnerId = @PartnerId;
END;


-- ---------------------------------------------------------------------------
-- usp_GetPartnerMonthlyRevenue
-- ---------------------------------------------------------------------------
GO
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


-- ---------------------------------------------------------------------------
-- usp_ListPartnerMonthlyOrders
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_ListPartnerMonthlyOrders
  @MonthStart DATETIME,
  @MonthEnd   DATETIME           -- exclusive: 00:00 ngày 1 tháng kế tiếp
AS
BEGIN
  SET NOCOUNT ON;

  -- Bảng kê từng đơn đã thanh toán của mọi CTV trong tháng — cùng cách chọn đơn
  -- với usp_GetPartnerMonthlyRevenue (mỗi coupon IsUsed = 1 lấy đơn thanh toán
  -- mới nhất, quy về tháng theo OrderDate) để tổng từng CTV khớp bảng kê tháng.
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      cp.PartnerId,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.IsUsed = 1
    GROUP BY cp.CouponID, cp.PartnerId
  )
  SELECT
    poi.PartnerId,
    o.OrderID,
    o.OrderDate,
    o.CouponCode,
    o.UserName    AS CustomerUserName,
    o.PackageName,
    o.ListAmount,
    o.Amount
  FROM  PaidOrderIds poi
  INNER JOIN vw_PaidOrders o ON o.OrderID = poi.OrderID
  WHERE o.OrderDate >= @MonthStart
    AND o.OrderDate <  @MonthEnd
  ORDER BY poi.PartnerId, o.OrderDate, o.OrderID;
END;


-- ---------------------------------------------------------------------------
-- usp_GetPartnerStats
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_GetPartnerStats
  @PartnerId  INT      = NULL,
  @Since      DATETIME = NULL,
  @ActiveOnly BIT      = 0
AS
BEGIN
  SET NOCOUNT ON;

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu.
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    LEFT JOIN Partners p ON p.PartnerId = cp.PartnerId
    WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
      AND cp.IsUsed = 1
      AND (@Since IS NULL OR cp.CreatedDate >= @Since)
      AND (@ActiveOnly = 0 OR p.IsActive = 1)
    GROUP BY cp.CouponID
  )
  SELECT
    COUNT(*)                                                                                  AS TotalCoupons,
    SUM(CASE WHEN cp.IsUsed = 1 THEN 1 ELSE 0 END)                                           AS PaidCoupons,
    SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END)             AS PendingCoupons,
    ISNULL(SUM(CASE WHEN cp.IsUsed = 1 THEN o.Amount ELSE 0 END), 0)                         AS TotalRevenue,
    COUNT(DISTINCT CASE WHEN cp.IsUsed = 1 THEN o.UserName END)                               AS CustomerCount
  FROM  Coupons cp
  LEFT  JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  LEFT  JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
  LEFT  JOIN Partners p ON p.PartnerId = cp.PartnerId
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Since IS NULL OR cp.CreatedDate >= @Since)
    AND (@ActiveOnly = 0 OR p.IsActive = 1);
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

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu.
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    WHERE cp.PartnerId = @PartnerId
      AND cp.IsUsed = 1
    GROUP BY cp.CouponID
  )
  -- Trả về 6 tháng gần nhất có doanh thu, sắp xếp DESC để gọi .reverse() phía app
  SELECT TOP 6
    FORMAT(o.OrderDate, 'yyyy-MM') AS Month,
    SUM(o.Amount)                  AS Revenue
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
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
  @IsDaily   BIT      = 0,      -- 1 = theo ngày (1W/1M), 0 = theo tháng (3M+)
  @ActiveOnly BIT     = 0
AS
BEGIN
  SET NOCOUNT ON;

  -- vw_PaidOrders: đơn IsPaid = 1, Amount = doanh thu thực thu.
  WITH PaidOrderIds AS (
    SELECT
      cp.CouponID,
      MAX(so.OrderID) AS OrderID
    FROM Coupons cp
    INNER JOIN vw_PaidOrders so ON so.CouponCode = cp.CouponCode
    LEFT JOIN Partners p ON p.PartnerId = cp.PartnerId
    WHERE cp.IsUsed = 1
      AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
      AND (@Since IS NULL OR cp.CreatedDate >= @Since)
      AND (@ActiveOnly = 0 OR p.IsActive = 1)
    GROUP BY cp.CouponID
  )
  SELECT
    CASE
      WHEN @IsDaily = 1 THEN FORMAT(o.OrderDate, 'yyyy-MM-dd')
      ELSE                    FORMAT(o.OrderDate, 'yyyy-MM')
    END                                                               AS Period,
    SUM(o.Amount)                                                     AS Revenue
  FROM  Coupons cp
  INNER JOIN PaidOrderIds poi ON poi.CouponID = cp.CouponID
  INNER JOIN vw_PaidOrders o  ON o.OrderID    = poi.OrderID
  LEFT  JOIN Partners p ON p.PartnerId = cp.PartnerId
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND cp.IsUsed = 1
    AND (@Since IS NULL OR cp.CreatedDate >= @Since)
    AND (@ActiveOnly = 0 OR p.IsActive = 1)
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

  -- PaidByCoupon: đơn đã thanh toán mới nhất của MỖI coupon, tính MỘT LẦN bằng một
  -- lượt quét index IsPaid (~35 ms) rồi join theo OrderID (PK). Trước đây mỗi coupon
  -- tra riêng bằng OUTER APPLY TOP (1) ... ORDER BY OrderDate DESC trên vw_PaidOrders;
  -- SQL Server ước lượng sai và quét ngược index OrderDate (~200k dòng) cho từng
  -- coupon nên trang 20 dòng mất 4–5 giây. Amount vẫn lấy qua vw_PaidOrders để cùng
  -- công thức với các báo cáo doanh thu.
  WITH PaidByCoupon AS (
    SELECT o.CouponCode, MAX(o.OrderID) AS OrderID
    FROM [EStocks_Data].[dbo].[service_Orders] o
    WHERE o.IsPaid = 1 AND o.CouponCode IS NOT NULL
    GROUP BY o.CouponCode
  ),
  -- Coupon có đơn đã thanh toán mà UserName trên đơn khớp từ khoá tìm kiếm
  -- (tính một lần thay vì EXISTS + LIKE cho từng coupon).
  PaidUserMatch AS (
    SELECT p.CouponCode
    FROM PaidByCoupon p
    INNER JOIN [EStocks_Data].[dbo].[service_Orders] so ON so.OrderID = p.OrderID
    WHERE @Q IS NOT NULL AND ISNULL(so.UserName, '') LIKE @Q
  ),
  PagedCoupons AS (
    SELECT
      cp.CouponID,
      cp.CouponCode,
      cp.PaymentLink,
      cp.IsUsed,
      cp.CreatedDate,
      cp.ExpireDate,
      cp.UserName,
      cp.Note
    FROM Coupons cp
    WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
      AND (
        @Status = 'ALL'
        OR (@Status = 'PAID'    AND cp.IsUsed = 1)
        OR (@Status = 'USED'    AND cp.IsUsed = 0 AND EXISTS (
          SELECT 1 FROM PaidByCoupon p WHERE p.CouponCode = cp.CouponCode
        ))
        OR (@Status = 'EXPIRED' AND cp.IsUsed = 0 AND cp.ExpireDate < GETDATE())
        OR (@Status = 'PENDING' AND cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() AND NOT EXISTS (
          SELECT 1 FROM PaidByCoupon p WHERE p.CouponCode = cp.CouponCode
        ))
      )
      AND (
        @Q IS NULL
        OR cp.CouponCode LIKE @Q
        OR ISNULL(cp.UserName, '') LIKE @Q
        OR cp.PaymentLink LIKE @Q
        OR cp.CouponCode IN (SELECT m.CouponCode FROM PaidUserMatch m)
      )
    ORDER BY cp.CreatedDate DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
  )
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
    -- Đã thanh toán: số thực thu của đơn; chưa thanh toán: giá gói trong link.
    COALESCE(o.Amount, pkg.Amount, 0)                                     AS OrderAmount,
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
  FROM  PagedCoupons cp
  LEFT  JOIN PaidByCoupon pbc ON pbc.CouponCode = cp.CouponCode
  LEFT  JOIN vw_PaidOrders o  ON o.OrderID      = pbc.OrderID
  LEFT  JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = COALESCE(
    o.PackageID,
    TRY_CAST(SUBSTRING(
      cp.PaymentLink,
      CHARINDEX('packageId=', cp.PaymentLink) + 10,
      CHARINDEX('&', cp.PaymentLink + '&', CHARINDEX('packageId=', cp.PaymentLink) + 10)
        - (CHARINDEX('packageId=', cp.PaymentLink) + 10)
    ) AS INT)
  )
  ORDER BY cp.CreatedDate DESC;
END;




-- ---------------------------------------------------------------------------
-- usp_ListCustomers
-- ---------------------------------------------------------------------------
GO
-- =============================================================================
-- usp_ListCustomers — danh sách khách hàng của CTV (/customers).
--
-- HIỆU NĂNG (đo 15/09/2026): bản cũ VƯỢT 15s (timeout request của app) nên trang treo.
-- Bốn thứ đắt tiền, sửa cả bốn:
--   1. CROSS APPLY TOP(1) trên vw_PaidOrders cho TỪNG coupon (~820ms): đúng cái bẫy mà
--      usp_ListCoupons đã ghi chú — SQL Server quét ngược index OrderDate cho mỗi coupon.
--      Thay bằng PaidByCoupon: một lượt quét index IsPaid rồi join theo OrderID (PK), ~40ms.
--   2. Ba subquery tương quan TOP(1) theo UserName cho MemberStartDate/MemberEndDate/
--      LatestPackage (~2,2s MỖI cột, chạy cho TOÀN BỘ khách): ba cột này không dùng để lọc
--      hay sắp xếp, nên giờ chỉ tính cho đúng @PageSize dòng của trang, bằng một OUTER APPLY.
--      (Giao diện /customers không hiển thị ba cột này; giữ lại vì /api/customers có trả ra.)
--   3. LEFT JOIN AspNetUsers qua linked server NEWFA theo từng dòng: đổi thành
--      INNER REMOTE JOIN trên bảng tạm để join chạy tại máy chủ từ xa.
--   4. Không tìm kiếm (@Q IS NULL) thì KHÔNG cần email/điện thoại để lọc — chỉ lấy cho 20
--      dòng của trang. Có tìm kiếm mới phải lấy cho toàn bộ ứng viên.
-- Kết quả: >15s -> ~110ms (không tìm kiếm), ~600ms (có tìm kiếm).
--
-- @Total OUTPUT trả tổng số dòng để trang không phải gọi usp_CountCustomers (tránh dựng
-- lại toàn bộ tập ứng viên lần thứ hai).
--
-- GIỮ NGUYÊN HÀNH VI: vẫn một dòng cho mỗi (khách × đối tác) như bản cũ (bản cũ gom theo
-- pu.Name, bản này gom theo cp.PartnerId — chỉ khác khi hai đối tác trùng tên).
-- vw_PaidOrders: IsPaid = 1, Amount = doanh thu thực thu (xem db/views/vw_PaidOrders.sql).
-- =============================================================================
CREATE OR ALTER PROCEDURE usp_ListCustomers
  @PartnerId  INT           = NULL,
  @Q          NVARCHAR(200) = NULL,   -- truyền dạng '%keyword%' từ app
  @Offset     INT           = 0,
  @PageSize   INT           = 20,
  @Total      INT           = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;

  -- 1. Đơn đã thanh toán mới nhất của mỗi coupon đã dùng
  CREATE TABLE #co (OrderID INT PRIMARY KEY, PartnerId INT);

  WITH PaidByCoupon AS (
    SELECT o.CouponCode, MAX(o.OrderID) AS OrderID
    FROM [EStocks_Data].[dbo].[service_Orders] o
    WHERE o.IsPaid = 1 AND o.CouponCode IS NOT NULL
    GROUP BY o.CouponCode
  )
  INSERT INTO #co (OrderID, PartnerId)
  SELECT p.OrderID, cp.PartnerId
  FROM  Coupons cp
  INNER JOIN PaidByCoupon p ON p.CouponCode = cp.CouponCode
  WHERE cp.IsUsed = 1
    AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId);

  -- 2. Gộp theo khách
  SELECT o.UserName, c.PartnerId,
         SUM(o.Amount)    AS TotalSpent,
         COUNT(*)         AS OrderCount,
         MIN(o.OrderDate) AS FirstOrderAt,
         MAX(o.OrderDate) AS LastOrderAt
  INTO   #agg
  FROM   #co c
  INNER JOIN vw_PaidOrders o ON o.OrderID = c.OrderID
  GROUP BY o.UserName, c.PartnerId;

  CREATE TABLE #page (
    UserName     NVARCHAR(256),
    PartnerId    INT,
    TotalSpent   FLOAT,
    OrderCount   INT,
    FirstOrderAt DATETIME,
    LastOrderAt  DATETIME,
    Email        NVARCHAR(256) NULL,
    PhoneNumber  NVARCHAR(50)  NULL
  );

  IF (@Q IS NULL)
  BEGIN
    -- 3a. Không tìm kiếm: phân trang cục bộ, chỉ hỏi linked server cho đúng 1 trang
    SELECT @Total = COUNT(*) FROM #agg;

    INSERT INTO #page (UserName, PartnerId, TotalSpent, OrderCount, FirstOrderAt, LastOrderAt)
    SELECT a.UserName, a.PartnerId, a.TotalSpent, a.OrderCount, a.FirstOrderAt, a.LastOrderAt
    FROM   #agg a
    ORDER  BY a.LastOrderAt DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

    SELECT DISTINCT UserName INTO #upage FROM #page;

    UPDATE pg
    SET    Email = src.Email, PhoneNumber = src.PhoneNumber
    FROM   #page pg
    INNER JOIN (
      SELECT u.UserName, a.Email, a.PhoneNumber
      FROM   #upage u
      INNER REMOTE JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers a ON a.UserName = u.UserName
    ) src ON src.UserName = pg.UserName;

    DROP TABLE #upage;
  END
  ELSE
  BEGIN
    -- 3b. Có tìm kiếm: @Q khớp cả email/điện thoại nên phải lấy cho toàn bộ ứng viên
    SELECT DISTINCT UserName INTO #uall FROM #agg;

    SELECT u.UserName, a.Email, a.PhoneNumber
    INTO   #info
    FROM   #uall u
    INNER REMOTE JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers a ON a.UserName = u.UserName;

    SELECT a.UserName, a.PartnerId, a.TotalSpent, a.OrderCount, a.FirstOrderAt, a.LastOrderAt,
           i.Email, i.PhoneNumber
    INTO   #match
    FROM   #agg a
    LEFT   JOIN #info i ON i.UserName = a.UserName
    WHERE  a.UserName LIKE @Q
        OR ISNULL(i.Email, '')       LIKE @Q
        OR ISNULL(i.PhoneNumber, '') LIKE @Q;

    SELECT @Total = COUNT(*) FROM #match;

    INSERT INTO #page (UserName, PartnerId, TotalSpent, OrderCount, FirstOrderAt, LastOrderAt, Email, PhoneNumber)
    SELECT m.UserName, m.PartnerId, m.TotalSpent, m.OrderCount, m.FirstOrderAt, m.LastOrderAt, m.Email, m.PhoneNumber
    FROM   #match m
    ORDER  BY m.LastOrderAt DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

    DROP TABLE #match;
    DROP TABLE #info;
    DROP TABLE #uall;
  END

  -- 4. Trang trí cho đúng số dòng của trang
  SELECT
    pg.UserName,
    pg.Email,
    pg.PhoneNumber,
    pg.TotalSpent,
    pg.OrderCount,
    pg.FirstOrderAt,
    pg.LastOrderAt,
    m.MemberStartDate,
    m.MemberEndDate,
    m.LatestPackage,
    pu.Name AS PartnerName
  FROM #page pg
  OUTER APPLY (
    SELECT TOP (1)
      so.StartDate   AS MemberStartDate,
      so.EndDate     AS MemberEndDate,
      so.PackageName AS LatestPackage
    FROM vw_PaidOrders so
    WHERE so.UserName = pg.UserName
    ORDER BY so.OrderDate DESC, so.OrderID DESC
  ) m
  LEFT JOIN Partners p                                ON p.PartnerId = pg.PartnerId
  LEFT JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers pu ON pu.UserName = p.UserName
  ORDER BY pg.LastOrderAt DESC;

  DROP TABLE #page;
  DROP TABLE #agg;
  DROP TABLE #co;
END;


-- ---------------------------------------------------------------------------
-- usp_ListPackages
-- ---------------------------------------------------------------------------
GO
CREATE OR ALTER PROCEDURE usp_ListPackages
AS
BEGIN
  SET NOCOUNT ON;

  -- Gói hội viên (danh sách cố định) + toàn bộ gói khóa học (ServiceID = 39)
  SELECT PackageID, ServiceID, Months, Amount, PackageName
  FROM   [EStocks_Data].[dbo].[service_Packages]
  WHERE  (
           PackageID IN (55, 43, 44, 45, 95, 96, 97, 98, 57, 49, 50, 51)
           OR ServiceID = 39
         )
    AND  IsTrial = 0
  ORDER BY PackageID;
END;


-- ---------------------------------------------------------------------------
-- usp_ListPaidOrdersWithoutAccount
-- ---------------------------------------------------------------------------
GO
-- =============================================================================
-- usp_ListPaidOrdersWithoutAccount — ĐỐI SOÁT: đơn CTV bán đã thu tiền nhưng email
-- khách CHƯA CÓ tài khoản FireAnt.
--
-- Vì sao cần: /payment/create cho phép tạo đơn cho email chưa tồn tại ("thu tiền
-- trước, tạo tài khoản sau"). Quyền lợi được ghi vào service_ServiceSubscribers theo
-- UserName, nên khách chỉ nhận được gói khi đăng ký ĐÚNG email đó. Nếu khách không
-- đăng ký (hoặc đăng ký bằng email khác) thì tiền đã thu mà không ai dùng được gói —
-- danh sách này là chỗ duy nhất nhìn thấy các ca đó để CTV đeo bám.
--
-- Dòng tự biến mất khỏi danh sách ngay khi khách đăng ký đúng email (không cần cờ
-- lưu sẵn, không bao giờ lệch thực tế).
--
-- HIỆU NĂNG (đo 15/09/2026, 873 ứng viên — bản đầu tiên mất 5,3s mỗi lần gọi):
--   1. KHÔNG lọc trên vw_PaidOrders: view có OUTER APPLY sang service_Upgrades, đắt khi
--      quét cả tập. Xác định đơn đã thanh toán của mỗi coupon bằng một lượt quét index
--      IsPaid (PaidByCoupon, ~40ms — đúng cách usp_ListCoupons đang làm), chỉ dùng
--      vw_PaidOrders ở bước cuối để lấy Amount cho đúng 20 dòng của trang.
--   2. KHÔNG dùng NOT EXISTS tương quan sang AspNetUsers qua linked server: mỗi dòng
--      một lượt gọi từ xa → 5,3s. Thay bằng INNER REMOTE JOIN để đẩy bảng tạm #cand
--      sang máy chủ NEWFA join tại chỗ, rồi anti-join cục bộ → 0,2–0,5s.
--      (REMOTE chỉ hợp lệ với INNER JOIN và chỉ đáng dùng khi vế cục bộ nhỏ — #cand
--       là số đơn đã thu tiền có coupon, hiện ~900.)
-- =============================================================================
CREATE OR ALTER PROCEDURE usp_ListPaidOrdersWithoutAccount
  @PartnerId INT           = NULL,
  @Q         NVARCHAR(200) = NULL,   -- truyền dạng '%keyword%' từ app
  @Offset    INT           = 0,
  @PageSize  INT           = 20,
  @Total     INT           = NULL OUTPUT   -- tổng số dòng, để trang không phải gọi thêm proc đếm
AS
BEGIN
  SET NOCOUNT ON;

  CREATE TABLE #cand (
    OrderID   INT PRIMARY KEY,
    CouponID  INT,
    UserName  NVARCHAR(256),
    OrderDate DATETIME
  );

  WITH PaidByCoupon AS (
    SELECT o.CouponCode, MAX(o.OrderID) AS OrderID
    FROM [EStocks_Data].[dbo].[service_Orders] o
    WHERE o.IsPaid = 1 AND o.CouponCode IS NOT NULL
    GROUP BY o.CouponCode
  )
  INSERT INTO #cand (OrderID, CouponID, UserName, OrderDate)
  SELECT so.OrderID, cp.CouponID, so.UserName, so.OrderDate
  FROM  Coupons cp
  INNER JOIN PaidByCoupon p                                   ON p.CouponCode = cp.CouponCode
  INNER JOIN [EStocks_Data].[dbo].[service_Orders] so         ON so.OrderID   = p.OrderID
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Q IS NULL OR ISNULL(so.UserName, '') LIKE @Q OR cp.CouponCode LIKE @Q);

  -- Ứng viên ĐÃ có tài khoản (xem chú thích hiệu năng ở đầu file)
  SELECT c.OrderID
  INTO   #has
  FROM   #cand c
  INNER REMOTE JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers u ON u.UserName = c.UserName;

  SELECT @Total = COUNT(*)
  FROM   #cand c
  WHERE  NOT EXISTS (SELECT 1 FROM #has h WHERE h.OrderID = c.OrderID);

  -- Phân trang trước khi trang trí, để các join còn lại chỉ chạm tối đa @PageSize dòng
  SELECT c.OrderID, c.CouponID
  INTO   #page
  FROM   #cand c
  WHERE  NOT EXISTS (SELECT 1 FROM #has h WHERE h.OrderID = c.OrderID)
  ORDER  BY c.OrderDate DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;

  SELECT
    o.OrderID,
    o.OrderDate,
    o.UserName,
    o.Amount,
    o.PackageName,
    o.ServiceID,
    o.EndDate,
    cp.CouponID,
    cp.CouponCode,
    cp.PartnerId,
    cp.Note,
    cp.CreatedDate,
    i.Name  AS PartnerName,
    i.Email AS PartnerEmail
  FROM  #page pg
  INNER JOIN vw_PaidOrders o                           ON o.OrderID   = pg.OrderID
  INNER JOIN Coupons cp                                ON cp.CouponID = pg.CouponID
  LEFT  JOIN Partners p                                ON p.PartnerId = cp.PartnerId
  LEFT  JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i  ON i.UserName  = p.UserName
  ORDER BY o.OrderDate DESC;

  DROP TABLE #page;
  DROP TABLE #has;
  DROP TABLE #cand;
END;


-- ---------------------------------------------------------------------------
-- usp_ListPartners
-- ---------------------------------------------------------------------------
GO
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
-- Hoàn tất. Tổng cộng 20 stored procedures + 1 view + 1 view đã được tạo/cập nhật.
-- =============================================================================
