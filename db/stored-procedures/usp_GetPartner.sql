CREATE OR ALTER PROCEDURE usp_GetPartner
  @PartnerId INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    p.PartnerId,
    i.UserName, i.Email, i.Name, i.PhoneNumber,
    p.IsActive,
    p.CreatedDate,
    po.UnderDiscountRate, po.AboveDiscountRate, po.RevenueReference
  FROM   Partners p
  LEFT  JOIN Policies po                              ON p.PolicyId = po.PolicyId
  INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON p.UserName = i.UserName
  WHERE  p.PartnerId = @PartnerId;
END;
