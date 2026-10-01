-- =============================================================================
-- Migration: nguồn khách + mã khuyến mại (voucher) trên link thanh toán của CTV.
--
--   Source         — CTV gắn khi tạo link (Zalo, TikTok, Facebook, Team 1…) để theo dõi
--                    khách đến từ kênh nào. Nhập tự do, NULL = chưa gắn nguồn.
--   VoucherCode    — mã khuyến mại admin tạo ở admin.fireant.vn
--                    (EStocks_Data.dbo.service_DiscountVouchers.Code, luôn CHỮ IN HOA).
--   DiscountAmount — số tiền đã giảm lúc tạo link (0 với voucher tặng ngày). Chỉ để hiển
--                    thị số tiền của link CHƯA thanh toán; nguồn thật của khoản giảm là
--                    EStocks_Data.dbo.service_DiscountVoucherUsages (theo OrderID).
--
-- Chạy 1 lần trên FireAnt_Partners TRƯỚC db/all-stored-procedures.sql (các proc mới đọc
-- những cột này) và trước khi deploy code mới. Idempotent, chạy lại được.
-- =============================================================================

IF COL_LENGTH('dbo.Coupons', 'Source') IS NULL
BEGIN
  ALTER TABLE dbo.Coupons ADD Source NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH('dbo.Coupons', 'VoucherCode') IS NULL
BEGIN
  ALTER TABLE dbo.Coupons ADD VoucherCode NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH('dbo.Coupons', 'DiscountAmount') IS NULL
BEGIN
  ALTER TABLE dbo.Coupons ADD DiscountAmount DECIMAL(18, 2) NULL;
END;
GO
