-- Migration: thêm cột CreatedDate vào bảng Partners
-- Chạy 1 lần trên SQL Server.

ALTER TABLE Partners
  ADD CreatedDate DATETIME NULL;

-- Backfill các hàng cũ bằng ngày tạo tài khoản FireAnt của đối tác (tạm thời hợp lý nhất)
UPDATE p
SET    p.CreatedDate = i.CreatedOnUtc
FROM   Partners p
INNER JOIN NEWFA.FireAnt_Identity.dbo.AspNetUsers i ON i.Id = p.UserId
WHERE  p.CreatedDate IS NULL;
