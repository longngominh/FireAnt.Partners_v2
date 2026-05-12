CREATE OR ALTER PROCEDURE usp_TogglePartnerActive
  @PartnerId INT,
  @IsActive  BIT
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE Partners
  SET    IsActive = @IsActive
  WHERE  PartnerId = @PartnerId;
END;
