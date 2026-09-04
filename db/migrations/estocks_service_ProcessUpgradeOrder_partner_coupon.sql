-- =============================================================================
-- [EStocks_Data] service_ProcessUpgradeOrder — ghi nhận coupon đối tác cho đơn NÂNG CẤP
--
-- BỐI CẢNH
--   FireAnt Partners (trang /payment/create, tab "Nâng cấp hội viên") tạo đơn nâng cấp
--   tự động cho khách của đối tác: đơn Pending gắn CouponCode + UpgradeAmount +
--   UpgradeFromPackageID (qua service_PrepareUpgradeOrder). Khi OnePay báo có tiền,
--   webhook company.fireant.vn gọi service_ProcessUpgradeOrder.
--
--   Với đơn MUA GÓI thường, service_ProcessOrder → service_SubProcess_Member đã:
--     - UPDATE FireAnt_Partners.dbo.Coupons SET IsUsed = 1
--     - INSERT FireAnt_Partners.dbo.PartnerCustomers
--   nhưng service_ProcessUpgradeOrder (bản 09/2026) KHÔNG làm hai việc này, nên
--   coupon nâng cấp mãi ở trạng thái "Đã sử dụng" thay vì "Đã thanh toán" và
--   doanh thu nâng cấp không được cộng cho đối tác (các usp_* lọc cp.IsUsed = 1).
--
-- VIỆC CẦN LÀM
--   Chạy script này trên EStocks_Data (cùng server với FireAnt_Partners). Script chỉ
--   THÊM khối "FireAnt Partners" vào cuối transaction của SP hiện có; logic nâng cấp
--   giữ nguyên. Nguồn SP gốc: FireAnt.Corporate.Web/FireAnt.Data/Scripts/
--   service_ProcessUpgradeOrder.sql — nên đồng bộ thay đổi này về repo Corporate.
-- =============================================================================

USE [EStocks_Data];
GO

CREATE OR ALTER PROCEDURE [dbo].[service_ProcessUpgradeOrder]
    @Result int OUTPUT,
    @OrderID int,
    @Comment nvarchar(1024)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET @Result = 0;

    DECLARE @UserName nvarchar(256), @NewPackageID int, @Amount float, @OldPackageID int, @EndDate datetime, @rc int;
    DECLARE @CouponCode nvarchar(50), @OrderDate datetime;

    SELECT @UserName = UserName,
           @NewPackageID = PackageID,
           @Amount = UpgradeAmount,
           @OldPackageID = UpgradeFromPackageID,
           @CouponCode = CouponCode,
           @OrderDate = OrderDate
    FROM dbo.service_Orders
    WHERE OrderID = @OrderID AND [Status] = 0;

    IF (@UserName IS NULL) RETURN; -- da xu ly hoac khong ton tai
    IF (@Amount IS NULL OR @Amount <= 0 OR @OldPackageID IS NULL) RETURN; -- khong phai don nang cap hop le

    BEGIN TRAN;

        EXEC @rc = dbo.service_Upgrade
            @Username = @UserName,
            @OldPackageID = @OldPackageID,
            @NewPackageID = @NewPackageID,
            @NewAmount = @Amount;

        IF (@rc IS NOT NULL AND @rc <> 0)
        BEGIN
            ROLLBACK;
            RETURN;
        END

        SELECT @EndDate = EndDate
        FROM dbo.service_ServiceSubscribers
        WHERE UserName = @UserName AND ServiceID IN (33, 34, 35);

        UPDATE dbo.service_Orders
        SET [Status] = 6, -- Nang cap
            IsPaid = 1,
            StartDate = GETDATE(),
            EndDate = @EndDate,
            Comment = @Comment
        WHERE OrderID = @OrderID;

        -- ---- FireAnt Partners: don nang cap do doi tac tao (mirror service_SubProcess_Member) ----
        IF (@CouponCode IS NOT NULL)
        BEGIN
            DECLARE @CouponId int, @PartnerId int;

            SELECT @CouponId = CouponId, @PartnerId = PartnerId
            FROM FireAnt_Partners.dbo.Coupons
            WHERE CouponCode = @CouponCode;

            IF (@CouponId IS NOT NULL)
            BEGIN
                UPDATE FireAnt_Partners.dbo.Coupons SET IsUsed = 1 WHERE CouponId = @CouponId;

                IF NOT EXISTS (SELECT 1 FROM FireAnt_Partners.dbo.PartnerCustomers WHERE UserName = @UserName AND PartnerId = @PartnerId)
                    INSERT FireAnt_Partners.dbo.PartnerCustomers(PartnerId, UserName) VALUES (@PartnerId, @UserName);
            END
        END

        SET @Result = 1;

    COMMIT;
END
GO
