CREATE OR ALTER PROCEDURE usp_CountCustomers
  @PartnerId INT           = NULL,
  @Q         NVARCHAR(200) = NULL    -- truyền dạng '%keyword%' từ app
AS
BEGIN
  SET NOCOUNT ON;

  SELECT COUNT(DISTINCT o.UserName) AS Total
  FROM  Coupons cp
  CROSS APPLY (
    SELECT TOP (1)
      so.UserName
    FROM [EStocks_Data].[dbo].[service_Orders] so
    WHERE so.CouponCode = cp.CouponCode
      AND so.Status = 1
    ORDER BY so.OrderDate DESC, so.OrderID DESC
  ) o
  LEFT  JOIN [NEWFA].[FireAnt_Identity].[dbo].[AspNetUsers] u ON u.UserName = o.UserName
  WHERE cp.IsUsed = 1
    AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
    AND (@Q IS NULL OR o.UserName LIKE @Q OR ISNULL(u.Email,'') LIKE @Q OR ISNULL(u.PhoneNumber,'') LIKE @Q);
END;
