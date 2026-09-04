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
