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
