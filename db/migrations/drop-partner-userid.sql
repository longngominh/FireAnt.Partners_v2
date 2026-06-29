-- Migration: bỏ cột UserId khỏi bảng Partners.
-- Chạy sau khi đã deploy/backfill Partners.UserName.

IF COL_LENGTH('dbo.Partners', 'UserName') IS NULL
BEGIN
  THROW 51000, 'Không thể drop Partners.UserId vì Partners.UserName chưa tồn tại.', 1;
END;
GO

IF EXISTS (SELECT 1 FROM dbo.Partners WHERE UserName IS NULL OR LTRIM(RTRIM(UserName)) = '')
BEGIN
  THROW 51001, 'Không thể drop Partners.UserId vì vẫn còn partner thiếu UserName.', 1;
END;
GO

-- Backfill CreatedDate lần cuối bằng UserName nếu cột này đã tồn tại.
IF COL_LENGTH('dbo.Partners', 'CreatedDate') IS NOT NULL
BEGIN
  UPDATE p
  SET    p.CreatedDate = i.CreatedOnUtc
  FROM   dbo.Partners p
  INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON i.UserName = p.UserName
  WHERE  p.CreatedDate IS NULL;
END;
GO

IF COL_LENGTH('dbo.Partners', 'UserId') IS NOT NULL
BEGIN
  DECLARE @sql NVARCHAR(MAX) = N'';

  -- Drop foreign keys referencing Partners.UserId.
  SELECT @sql = @sql + N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(parent.schema_id)) + N'.' + QUOTENAME(parent.name)
    + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';' + CHAR(13)
  FROM sys.foreign_keys fk
  INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
  INNER JOIN sys.tables parent ON parent.object_id = fk.parent_object_id
  INNER JOIN sys.columns parent_col
    ON parent_col.object_id = fkc.parent_object_id
   AND parent_col.column_id = fkc.parent_column_id
  WHERE fk.parent_object_id = OBJECT_ID('dbo.Partners')
    AND parent_col.name = 'UserId';

  -- Drop default constraints on Partners.UserId.
  SELECT @sql = @sql + N'ALTER TABLE dbo.Partners DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';' + CHAR(13)
  FROM sys.default_constraints dc
  INNER JOIN sys.columns c
    ON c.object_id = dc.parent_object_id
   AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.Partners')
    AND c.name = 'UserId';

  -- Drop check constraints that reference Partners.UserId.
  SELECT @sql = @sql + N'ALTER TABLE dbo.Partners DROP CONSTRAINT ' + QUOTENAME(cc.name) + N';' + CHAR(13)
  FROM sys.check_constraints cc
  WHERE cc.parent_object_id = OBJECT_ID('dbo.Partners')
    AND cc.definition LIKE '%UserId%';

  -- Drop unique/key constraints that include Partners.UserId.
  SELECT @sql = @sql + N'ALTER TABLE dbo.Partners DROP CONSTRAINT ' + QUOTENAME(kc.name) + N';' + CHAR(13)
  FROM sys.key_constraints kc
  INNER JOIN sys.index_columns ic
    ON ic.object_id = kc.parent_object_id
   AND ic.index_id = kc.unique_index_id
  INNER JOIN sys.columns c
    ON c.object_id = ic.object_id
   AND c.column_id = ic.column_id
  WHERE kc.parent_object_id = OBJECT_ID('dbo.Partners')
    AND c.name = 'UserId';

  -- Drop non-PK indexes that include Partners.UserId.
  SELECT @sql = @sql + N'DROP INDEX ' + QUOTENAME(i.name) + N' ON dbo.Partners;' + CHAR(13)
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID('dbo.Partners')
    AND i.is_primary_key = 0
    AND i.is_unique_constraint = 0
    AND i.name IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM sys.index_columns ic
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id
       AND c.column_id = ic.column_id
      WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND c.name = 'UserId'
    );

  IF @sql <> N''
  BEGIN
    EXEC sp_executesql @sql;
  END;

  ALTER TABLE dbo.Partners DROP COLUMN UserId;
END;
GO
