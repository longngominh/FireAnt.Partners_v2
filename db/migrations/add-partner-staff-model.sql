-- =============================================================================
-- Migration: mô hình đối tác – nhân viên bán hàng + phụ lục hợp đồng (11/2026).
-- Thay cho add-partner-network.sql (cây đội nhiều cấp — chưa từng chạy, đã bỏ).
--
--   Partners.PartnerType     — thêm 'partner_staff': nhân viên bán hàng của một đối tác.
--                              Có tài khoản và link riêng; FireAnt không chi trả cho họ.
--   Partners.LegalType       — 'individual' | 'company': đối tác cá nhân hay pháp nhân.
--   Partners.TaxCode         — mã số thuế của người/pháp nhân đứng tên hợp đồng.
--   PartnerContractTiers     — phụ lục đang áp dụng (Thường/Bạc/Vàng/Kim cương), luôn tính
--                              từ ngày 01 của tháng. Màn quản trị chỉ chọn phụ lục hiện tại;
--                              mỗi lần đổi vẫn được giữ lại để các tháng trước tính đúng
--                              phụ lục đã dùng.
--   PartnerStaffApplications — đối tác đề xuất nhân viên, FireAnt duyệt hoặc từ chối kèm lý do.
--   PartnerStaffMemberships  — khoảng [StartDate, EndDate) nhân viên được ghi nhận cho đối tác.
--                              Doanh số của nhân viên chỉ tính cho đối tác trong khoảng này;
--                              mỗi nhân viên tối đa một khoảng đang mở (EndDate IS NULL).
--
-- Thứ tự deploy: chạy file này trên FireAnt_Partners → chạy db/all-stored-procedures.sql
-- (các proc nhận thêm @TeamOf) → deploy code. Idempotent, chạy lại được.
-- Code mới vẫn chạy khi chưa có migration: mọi đối tác tính theo chính sách Thường,
-- các trang nhân viên/duyệt báo cần cập nhật CSDL.
-- =============================================================================

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Partners_PartnerType')
BEGIN
  ALTER TABLE dbo.Partners DROP CONSTRAINT CK_Partners_PartnerType;
END;
GO

ALTER TABLE dbo.Partners
  ADD CONSTRAINT CK_Partners_PartnerType
    CHECK (PartnerType IN (N'sales_employee', N'collaborator', N'partner_staff'));
GO

IF COL_LENGTH('dbo.Partners', 'LegalType') IS NULL
BEGIN
  ALTER TABLE dbo.Partners
    ADD LegalType NVARCHAR(16) NOT NULL
      CONSTRAINT DF_Partners_LegalType DEFAULT (N'individual');
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Partners_LegalType')
BEGIN
  ALTER TABLE dbo.Partners
    ADD CONSTRAINT CK_Partners_LegalType CHECK (LegalType IN (N'individual', N'company'));
END;
GO

IF COL_LENGTH('dbo.Partners', 'TaxCode') IS NULL
BEGIN
  ALTER TABLE dbo.Partners ADD TaxCode NVARCHAR(20) NULL;
END;
GO

IF OBJECT_ID(N'dbo.PartnerContractTiers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PartnerContractTiers
  (
    ContractTierId INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_PartnerContractTiers PRIMARY KEY,
    PartnerId      INT           NOT NULL
      CONSTRAINT FK_PartnerContractTiers_Partner REFERENCES dbo.Partners (PartnerId),
    Tier           NVARCHAR(16)  NOT NULL,
    EffectiveMonth DATE          NOT NULL,   -- ngày 01 của tháng bắt đầu áp dụng
    ChangedBy      NVARCHAR(256) NOT NULL,   -- email quản lý FireAnt chọn phụ lục
    ChangedDate    DATETIME      NOT NULL
      CONSTRAINT DF_PartnerContractTiers_ChangedDate DEFAULT (GETDATE()),
    CONSTRAINT CK_PartnerContractTiers_Tier CHECK (Tier IN (N'normal', N'silver', N'gold', N'diamond')),
    CONSTRAINT CK_PartnerContractTiers_Day1 CHECK (DAY(EffectiveMonth) = 1)
  );

  CREATE NONCLUSTERED INDEX IX_PartnerContractTiers_Partner
    ON dbo.PartnerContractTiers (PartnerId, EffectiveMonth, ContractTierId);
END;
GO

IF OBJECT_ID(N'dbo.PartnerStaffApplications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PartnerStaffApplications
  (
    ApplicationId  INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_PartnerStaffApplications PRIMARY KEY,
    PartnerId      INT            NOT NULL   -- đối tác đề xuất
      CONSTRAINT FK_PartnerStaffApplications_Partner REFERENCES dbo.Partners (PartnerId),
    UserName       NVARCHAR(256)  NOT NULL,  -- tài khoản FireAnt của nhân viên
    FullName       NVARCHAR(200)  NULL,
    PhoneNumber    NVARCHAR(20)   NULL,
    Note           NVARCHAR(1000) NULL,
    Status         NVARCHAR(16)   NOT NULL
      CONSTRAINT DF_PartnerStaffApplications_Status DEFAULT (N'pending'),
    CreatedBy      NVARCHAR(256)  NOT NULL,  -- email đăng nhập người đề xuất
    CreatedDate    DATETIME       NOT NULL
      CONSTRAINT DF_PartnerStaffApplications_CreatedDate DEFAULT (GETDATE()),
    ReviewedBy     NVARCHAR(256)  NULL,
    ReviewedDate   DATETIME       NULL,
    RejectReason   NVARCHAR(500)  NULL,      -- đối tác và nhân viên thấy lý do này
    StaffPartnerId INT            NULL       -- Partners của nhân viên, có khi đã duyệt
      CONSTRAINT FK_PartnerStaffApplications_Staff REFERENCES dbo.Partners (PartnerId),
    CONSTRAINT CK_PartnerStaffApplications_Status
      CHECK (Status IN (N'pending', N'approved', N'rejected', N'cancelled'))
  );

  CREATE NONCLUSTERED INDEX IX_PartnerStaffApplications_Partner
    ON dbo.PartnerStaffApplications (PartnerId, CreatedDate);
  CREATE NONCLUSTERED INDEX IX_PartnerStaffApplications_Status
    ON dbo.PartnerStaffApplications (Status, CreatedDate);
  -- Một tài khoản chỉ có tối đa một đề xuất đang chờ.
  CREATE UNIQUE NONCLUSTERED INDEX UX_PartnerStaffApplications_PendingUser
    ON dbo.PartnerStaffApplications (UserName)
    WHERE Status = N'pending';
END;
GO

IF OBJECT_ID(N'dbo.PartnerStaffMemberships', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PartnerStaffMemberships
  (
    MembershipId   INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_PartnerStaffMemberships PRIMARY KEY,
    StaffPartnerId INT           NOT NULL
      CONSTRAINT FK_PartnerStaffMemberships_Staff REFERENCES dbo.Partners (PartnerId),
    PartnerId      INT           NOT NULL
      CONSTRAINT FK_PartnerStaffMemberships_Partner REFERENCES dbo.Partners (PartnerId),
    ApplicationId  INT           NULL
      CONSTRAINT FK_PartnerStaffMemberships_Application
        REFERENCES dbo.PartnerStaffApplications (ApplicationId),
    StartDate      DATETIME      NOT NULL,   -- lúc FireAnt duyệt (hoặc mở lại)
    EndDate        DATETIME      NULL,       -- lúc ngừng hợp tác; NULL = đang ghi nhận
    StartedBy      NVARCHAR(256) NOT NULL,
    EndedBy        NVARCHAR(256) NULL,
    EndedByRole    NVARCHAR(16)  NULL,       -- partner | admin
    CONSTRAINT CK_PartnerStaffMemberships_NotSelf CHECK (StaffPartnerId <> PartnerId),
    CONSTRAINT CK_PartnerStaffMemberships_Range CHECK (EndDate IS NULL OR EndDate >= StartDate)
  );

  CREATE NONCLUSTERED INDEX IX_PartnerStaffMemberships_Staff
    ON dbo.PartnerStaffMemberships (StaffPartnerId, StartDate) INCLUDE (PartnerId, EndDate);
  CREATE NONCLUSTERED INDEX IX_PartnerStaffMemberships_Partner
    ON dbo.PartnerStaffMemberships (PartnerId, StartDate) INCLUDE (StaffPartnerId, EndDate);
  CREATE UNIQUE NONCLUSTERED INDEX UX_PartnerStaffMemberships_Open
    ON dbo.PartnerStaffMemberships (StaffPartnerId)
    WHERE EndDate IS NULL;
END;
GO
