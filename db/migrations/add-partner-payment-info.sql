-- Migration: thông tin chi trả của cộng tác viên, dùng cho Giấy đề nghị thanh toán.
-- FullName tách riêng khỏi AspNetUsers.Name vì tên hiển thị trên IS4 thường là
-- nickname ("hai bang"), còn chứng từ chuyển khoản cần tên trên tài khoản ngân hàng.
-- Chạy 1 lần trên SQL Server trước khi deploy code mới.

IF COL_LENGTH('Partners', 'FullName') IS NULL
BEGIN
  ALTER TABLE Partners ADD FullName NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH('Partners', 'BankAccountNumber') IS NULL
BEGIN
  ALTER TABLE Partners ADD BankAccountNumber NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH('Partners', 'BankName') IS NULL
BEGIN
  ALTER TABLE Partners ADD BankName NVARCHAR(100) NULL;
END;
GO
