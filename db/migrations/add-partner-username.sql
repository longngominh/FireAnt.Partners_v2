-- Migration: thêm cột UserName vào bảng Partners và populate từ AspNetUsers qua UserId
-- Chạy script này trước khi deploy code mới.

-- Bước 1: thêm cột UserName (nullable để không lỗi với dữ liệu cũ)
ALTER TABLE Partners
  ADD UserName NVARCHAR(256) NULL;
GO

-- Bước 2: populate UserName từ AspNetUsers dựa vào UserId
UPDATE p
SET    p.UserName = u.UserName
FROM   Partners p
INNER  JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers u ON u.Id = p.UserId
WHERE  p.UserName IS NULL;
GO

-- Bước 3: thêm unique index (đảm bảo không trùng, NULL được bỏ qua)
CREATE UNIQUE NONCLUSTERED INDEX UX_Partners_UserName
  ON Partners (UserName)
  WHERE UserName IS NOT NULL;
GO

-- Kiểm tra kết quả: các partner có UserName chưa được populate (nếu có)
SELECT PartnerId, UserId, UserName
FROM   Partners
WHERE  UserName IS NULL;
GO
