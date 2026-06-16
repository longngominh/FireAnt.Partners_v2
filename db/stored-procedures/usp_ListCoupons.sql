CREATE OR ALTER PROCEDURE usp_ListCoupons
  @PartnerId INT           = NULL,
  @Status    NVARCHAR(20)  = 'ALL',
  @Q         NVARCHAR(200) = NULL,   -- truyền dạng '%keyword%' từ app
  @Offset    INT           = 0,
  @PageSize  INT           = 20
AS
BEGIN
  SET NOCOUNT ON;

  WITH PagedCoupons AS (
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
          SELECT 1
          FROM [EStocks_Data].[dbo].[service_Orders] so
          WHERE so.CouponCode = cp.CouponCode AND so.Status = 1
        ))
        OR (@Status = 'EXPIRED' AND cp.IsUsed = 0 AND cp.ExpireDate < GETDATE())
        OR (@Status = 'PENDING' AND cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() AND NOT EXISTS (
          SELECT 1
          FROM [EStocks_Data].[dbo].[service_Orders] so
          WHERE so.CouponCode = cp.CouponCode AND so.Status = 1
        ))
      )
      AND (
        @Q IS NULL
        OR cp.CouponCode LIKE @Q
        OR ISNULL(cp.UserName, '') LIKE @Q
        OR cp.PaymentLink LIKE @Q
        OR EXISTS (
          SELECT 1
          FROM [EStocks_Data].[dbo].[service_Orders] so
          WHERE so.CouponCode = cp.CouponCode
            AND so.Status = 1
            AND ISNULL(so.UserName, '') LIKE @Q
        )
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
    ISNULL(pkg.Amount, 0)                                                 AS OrderAmount,
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
  OUTER APPLY (
    SELECT TOP (1)
      so.OrderID,
      so.OrderDate,
      so.UserName,
      so.PackageID
    FROM [EStocks_Data].[dbo].[service_Orders] so
    WHERE so.CouponCode = cp.CouponCode
      AND so.Status = 1
    ORDER BY so.OrderDate DESC, so.OrderID DESC
  ) o
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
