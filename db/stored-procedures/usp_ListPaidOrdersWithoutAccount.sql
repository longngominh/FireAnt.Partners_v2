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
GO
