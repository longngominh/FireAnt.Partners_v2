CREATE OR ALTER PROCEDURE usp_ListPackages
AS
BEGIN
  SET NOCOUNT ON;

  -- Gói hội viên (danh sách cố định) + toàn bộ gói khóa học (ServiceID = 39)
  SELECT PackageID, ServiceID, Months, Amount, PackageName
  FROM   [EStocks_Data].[dbo].[service_Packages]
  WHERE  (
           PackageID IN (55, 43, 44, 45, 95, 96, 97, 98, 57, 49, 50, 51)
           OR ServiceID = 39
         )
    AND  IsTrial = 0
  ORDER BY PackageID;
END;
