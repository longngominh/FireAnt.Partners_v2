CREATE OR ALTER PROCEDURE usp_ListPackages
AS
BEGIN
  SET NOCOUNT ON;

  SELECT PackageID, Months, Amount, PackageName
  FROM   [EStocks_Data].[dbo].[service_Packages]
  WHERE  PackageID IN (55, 43, 44, 45, 95, 96, 97, 98, 57, 49, 50, 51)
    AND  IsTrial = 0
  ORDER BY PackageID;
END;
