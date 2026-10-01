CREATE OR ALTER PROCEDURE usp_CreateCoupon
  @PartnerId      INT,
  @CouponCode     NVARCHAR(50),
  @PaymentLink    NVARCHAR(MAX),
  @PackageId      INT = NULL,
  @UserName       NVARCHAR(256) = NULL,
  @Note           NVARCHAR(MAX) = NULL,
  @Source         NVARCHAR(50) = NULL,     -- nguồn khách (Zalo, TikTok, Team 1…)
  @VoucherCode    NVARCHAR(20) = NULL,     -- mã khuyến mại đã áp vào đơn của link
  @DiscountAmount DECIMAL(18, 2) = NULL    -- số tiền đã giảm (0 với voucher tặng ngày)
AS
BEGIN
  SET NOCOUNT ON;

  INSERT INTO Coupons
    (PartnerId, CouponTypeId, CouponCode, IsUsed, CreatedDate, ExpireDate, PaymentLink, PackageId, UserName, Note,
     Source, VoucherCode, DiscountAmount)
  VALUES
    (@PartnerId, 1, @CouponCode, 0, GETDATE(), DATEADD(day, 14, GETDATE()), @PaymentLink, @PackageId, @UserName, @Note,
     @Source, @VoucherCode, @DiscountAmount);

  SELECT SCOPE_IDENTITY() AS CouponID;
END;
