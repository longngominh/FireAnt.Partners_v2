-- Migration: phân loại cộng tác viên để tính thù lao theo Excel
-- Chạy 1 lần trên SQL Server trước khi deploy code mới.

IF COL_LENGTH('Partners', 'PartnerType') IS NULL
BEGIN
  ALTER TABLE Partners
    ADD PartnerType NVARCHAR(32) NOT NULL
      CONSTRAINT DF_Partners_PartnerType DEFAULT N'collaborator';
END;
GO

UPDATE Partners
SET PartnerType = N'collaborator'
WHERE PartnerType IS NULL
   OR PartnerType NOT IN (N'sales_employee', N'collaborator');
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = N'CK_Partners_PartnerType'
)
BEGIN
  ALTER TABLE Partners
    ADD CONSTRAINT CK_Partners_PartnerType
      CHECK (PartnerType IN (N'sales_employee', N'collaborator'));
END;
GO
