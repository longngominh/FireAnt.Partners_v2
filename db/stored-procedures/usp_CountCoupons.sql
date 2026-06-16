CREATE OR ALTER PROCEDURE usp_CountCoupons
  @PartnerId INT           = NULL,
  @Status    NVARCHAR(20)  = 'ALL',
  @Q         NVARCHAR(200) = NULL    -- truyền dạng '%keyword%' từ app
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS Total
  FROM  Coupons cp
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
      OR ISNULL(cp.UserName,'') LIKE @Q
      OR EXISTS (
        SELECT 1
        FROM [EStocks_Data].[dbo].[service_Orders] so
        WHERE so.CouponCode = cp.CouponCode
          AND so.Status = 1
          AND ISNULL(so.UserName, '') LIKE @Q
      )
    );
END;
