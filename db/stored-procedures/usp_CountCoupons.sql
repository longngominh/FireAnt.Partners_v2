CREATE OR ALTER PROCEDURE usp_CountCoupons
  @PartnerId INT           = NULL,
  @Status    NVARCHAR(20)  = 'ALL',
  @Q         NVARCHAR(200) = NULL    -- truyền dạng '%keyword%' từ app
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(*) AS Total
  FROM  Coupons cp
  LEFT  JOIN [EStocks_Data].[dbo].[service_Orders] o ON o.CouponCode = cp.CouponCode
  WHERE (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (
      @Status = 'ALL'
      OR (@Status = 'PAID'    AND cp.IsUsed = 1)
      OR (@Status = 'USED'    AND o.OrderID IS NOT NULL AND cp.IsUsed = 0)
      OR (@Status = 'EXPIRED' AND cp.IsUsed = 0 AND cp.ExpireDate < GETDATE())
      OR (@Status = 'PENDING' AND cp.IsUsed = 0 AND o.OrderID IS NULL AND cp.ExpireDate >= GETDATE())
    )
    AND (@Q IS NULL OR cp.CouponCode LIKE @Q OR ISNULL(cp.UserName,'') LIKE @Q);
END;
