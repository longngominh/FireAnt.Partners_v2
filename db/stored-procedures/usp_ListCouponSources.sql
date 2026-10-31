-- =============================================================================
-- usp_ListCouponSources — các nguồn khách (Coupons.Source) đối tác đã dùng.
--
-- Dùng cho gợi ý ở /payment/create và ô lọc "Nguồn" ở /payment, /customers.
-- Mới dùng gần nhất xếp trước. Coupons chỉ vài nghìn dòng nên quét thẳng là đủ nhanh.
-- Collation không phân biệt hoa/thường nên "zalo" và "Zalo" gộp làm một.
-- =============================================================================
CREATE OR ALTER PROCEDURE usp_ListCouponSources
  @PartnerId INT = NULL,
  @TeamOf    INT           = NULL    -- đối tác: gồm cả link của nhân viên trong thời gian được ghi nhận
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP (50)
    cp.Source,
    COUNT(*)            AS LinkCount,
    MAX(cp.CreatedDate) AS LastUsedAt
  FROM  Coupons cp
  WHERE cp.Source IS NOT NULL
    AND (@PartnerId IS NULL OR cp.PartnerId = @PartnerId)
      AND (@TeamOf IS NULL OR cp.PartnerId = @TeamOf OR EXISTS (
        SELECT 1 FROM PartnerStaffMemberships ms
        WHERE ms.PartnerId = @TeamOf
          AND ms.StaffPartnerId = cp.PartnerId
          AND cp.CreatedDate >= ms.StartDate
          AND (ms.EndDate IS NULL OR cp.CreatedDate < ms.EndDate)
      ))
  GROUP BY cp.Source
  ORDER BY MAX(cp.CreatedDate) DESC;
END;
