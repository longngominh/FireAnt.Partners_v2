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
-- vw_PaidOrders: IsPaid = 1, Amount = doanh thu thực thu (xem db/views/vw_PaidOrders.sql).
-- =============================================================================
CREATE OR ALTER PROCEDURE usp_ListPaidOrdersWithoutAccount
  @PartnerId INT           = NULL,
  @Q         NVARCHAR(200) = NULL,   -- truyền dạng '%keyword%' từ app
  @Offset    INT           = 0,
  @PageSize  INT           = 20
AS
BEGIN
  SET NOCOUNT ON;

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
  FROM  vw_PaidOrders o
  INNER JOIN Coupons cp                                ON cp.CouponCode = o.CouponCode
  LEFT  JOIN Partners p                                ON p.PartnerId   = cp.PartnerId
  LEFT  JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i  ON i.UserName    = p.UserName
  WHERE NOT EXISTS (
          SELECT 1
          FROM NEWFA.FireAnt_Identity.dbo.AspNetUsers u
          WHERE u.UserName = o.UserName
        )
    AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Q IS NULL OR ISNULL(o.UserName, '') LIKE @Q OR cp.CouponCode LIKE @Q)
  ORDER BY o.OrderDate DESC
  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE usp_CountPaidOrdersWithoutAccount
  @PartnerId INT           = NULL,
  @Q         NVARCHAR(200) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS Total
  FROM  vw_PaidOrders o
  INNER JOIN Coupons cp ON cp.CouponCode = o.CouponCode
  WHERE NOT EXISTS (
          SELECT 1
          FROM NEWFA.FireAnt_Identity.dbo.AspNetUsers u
          WHERE u.UserName = o.UserName
        )
    AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Q IS NULL OR ISNULL(o.UserName, '') LIKE @Q OR cp.CouponCode LIKE @Q);
END;
GO
