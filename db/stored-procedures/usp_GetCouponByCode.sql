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
