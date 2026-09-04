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
