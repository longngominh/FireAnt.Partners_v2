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
