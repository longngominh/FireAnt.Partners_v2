-- =============================================================================
-- Migration: số điện thoại khách + nhật ký tạo tài khoản hộ khách.
--
--   Coupons.CustomerPhone — số di động CTV nhập khi tạo link (bắt buộc với khách chưa có
--                           số trong tài khoản). Số cũng được ghi vào
--                           FireAnt_Identity.dbo.AspNetUsers.PhoneNumber (chỉ khi tài khoản
--                           chưa có số) để ZNS và hệ thống khóa học dùng.
--   CustomerAccountLog    — mỗi lần Partners tạo tài khoản FireAnt hộ khách (CREATE_ACCOUNT)
--                           hoặc điền số cho tài khoản chưa có số (FILL_PHONE): ai làm, cho
--                           tài khoản nào, thành công hay không. Dùng để truy vết và giới hạn
--                           số tài khoản một người tạo trong 24 giờ.
--
-- QUYỀN CẦN CÓ: Partners ghi PhoneNumber qua linked server NEWFA
--   UPDATE NEWFA.FireAnt_Identity.dbo.AspNetUsers SET PhoneNumber = …, PhoneNumberConfirmed = 0
-- nên login mà NEWFA ánh xạ sang phải có quyền UPDATE trên AspNetUsers. Thiếu quyền thì link và
-- tài khoản vẫn tạo được, chỉ báo "chưa lưu được số điện thoại vào tài khoản".
--
-- Chạy 1 lần trên FireAnt_Partners SAU add-coupon-source-voucher.sql và TRƯỚC
-- db/all-stored-procedures.sql + deploy code. Idempotent, chạy lại được.
-- =============================================================================

IF COL_LENGTH('dbo.Coupons', 'CustomerPhone') IS NULL
BEGIN
  ALTER TABLE dbo.Coupons ADD CustomerPhone NVARCHAR(20) NULL;
END;
GO

IF OBJECT_ID('dbo.CustomerAccountLog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CustomerAccountLog
  (
    LogId       INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_CustomerAccountLog PRIMARY KEY,
    Action      NVARCHAR(20)  NOT NULL,   -- CREATE_ACCOUNT | FILL_PHONE
    PartnerId   INT           NULL,       -- đối tác của phiên đăng nhập (admin có thể NULL)
    CreatedBy   NVARCHAR(256) NOT NULL,   -- email đăng nhập Partners của người thao tác
    UserName    NVARCHAR(256) NOT NULL,   -- tài khoản FireAnt của khách
    PhoneNumber NVARCHAR(20)  NULL,
    Succeeded   BIT           NOT NULL,
    Note        NVARCHAR(500) NULL,
    CreatedDate DATETIME      NOT NULL CONSTRAINT DF_CustomerAccountLog_CreatedDate DEFAULT (GETDATE())
  );

  CREATE NONCLUSTERED INDEX IX_CustomerAccountLog_CreatedBy_Date
    ON dbo.CustomerAccountLog (CreatedBy, CreatedDate)
    INCLUDE (Action, Succeeded);
END;
GO
