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
