import { cache } from "react";
import { getPool, sql } from "@/lib/db/sql";
import { isPartnerStaffType, normalizePartnerType, type PartnerType } from "@/lib/commission";
import { getCurrentContract, NORMAL_CONTRACT, type PartnerContract } from "@/lib/data/contracts";
import {
  emptyBreakdown,
  getMonthBreakdownMap,
  type RevenueBreakdown,
} from "@/lib/data/revenue-breakdown";
import { getStaffAffiliation, type StaffAffiliation } from "@/lib/data/staff";
import { hasStaffModel } from "@/lib/data/staff-model";
import { currentMonthKey } from "@/lib/utils/month";

/**
 * Dữ liệu dùng chung giữa layout cổng bán hàng và các trang trong cùng một request
 * (React cache): thanh bên và trang tổng quan cùng cần phụ lục/đối tác trực thuộc mà chỉ
 * truy vấn một lần.
 */

export type PartnerSummary = {
  partnerId: number;
  userName: string;
  /** Chế độ thù lao (nhân viên của đối tác không có, coi như collaborator). */
  partnerType: PartnerType;
  isStaff: boolean;
  isActive: boolean;
  fullName: string | null;
  legalType: "individual" | "company";
  taxCode: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  createdAt: Date | null;
};

type SummaryRow = {
  PartnerId: number;
  UserName: string;
  PartnerType: string | null;
  IsActive: boolean | number | null;
  FullName?: string | null;
  LegalType?: string | null;
  TaxCode?: string | null;
  BankName?: string | null;
  BankAccountNumber?: string | null;
  CreatedDate?: Date | null;
};

export const getPartnerSummary = cache(async (partnerId: number): Promise<PartnerSummary | null> => {
  const pool = await getPool();
  const run = (columns: string) =>
    pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .query<SummaryRow>(
        `SELECT PartnerId, UserName, PartnerType, IsActive${columns} FROM Partners WHERE PartnerId = @PartnerId;`,
      );
  try {
    let res;
    try {
      res = await run(", FullName, LegalType, TaxCode, BankName, BankAccountNumber, CreatedDate");
    } catch {
      // Chưa chạy add-partner-staff-model.sql → chưa có LegalType/TaxCode.
      res = await run(", FullName, BankName, BankAccountNumber, CreatedDate");
    }
    const r = res.recordset[0];
    if (!r) return null;
    return {
      partnerId: r.PartnerId,
      userName: r.UserName,
      partnerType: normalizePartnerType(r.PartnerType),
      isStaff: isPartnerStaffType(r.PartnerType),
      isActive: r.IsActive !== false && r.IsActive !== 0,
      fullName: r.FullName?.trim() || null,
      legalType: r.LegalType === "company" ? "company" : "individual",
      taxCode: r.TaxCode?.trim() || null,
      bankName: r.BankName?.trim() || null,
      bankAccountNumber: r.BankAccountNumber?.trim() || null,
      createdAt: r.CreatedDate ?? null,
    };
  } catch (err) {
    console.error("[getPartnerSummary]", err);
    return null;
  }
});

export function partnerDisplayName(summary: Pick<PartnerSummary, "fullName" | "userName"> | null): string {
  return summary?.fullName || summary?.userName || "Đối tác";
}

/** Phụ lục đang hiệu lực của đối tác đang đăng nhập (cache theo request). */
export const getPortalContract = cache(async (partnerId: number): Promise<PartnerContract> => {
  try {
    return await getCurrentContract(partnerId);
  } catch (err) {
    console.error("[getPortalContract]", err);
    return NORMAL_CONTRACT;
  }
});

/** Đối tác mà nhân viên đang đăng nhập trực thuộc (cache theo request). */
export const getPortalAffiliation = cache(
  async (staffPartnerId: number): Promise<StaffAffiliation | null> => getStaffAffiliation(staffPartnerId),
);

export type LinkStats = {
  createdThisMonth: number;
  paidOfCreatedThisMonth: number;
  pending: number;
  /** Giá trị niêm yết (đã trừ mã giảm) của các link đang chờ — đơn nâng cấp tính theo giá gói nên chỉ là ước tính. */
  pendingValue: number;
  expiringSoon: number;
  /** Ngày hết hạn sớm nhất trong các link đang chờ. */
  nextExpiry: Date | null;
};

/**
 * Thống kê link. team = true (đối tác): gồm link của nhân viên tạo trong thời gian được
 * ghi nhận; false: chỉ link của chính người này.
 */
export async function getLinkStats(partnerId: number, team = false): Promise<LinkStats> {
  try {
    const withTeam = team && (await hasStaffModel());
    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .query<{
        CreatedThisMonth: number | null;
        PaidOfCreated: number | null;
        Pending: number | null;
        PendingValue: number | null;
        ExpiringSoon: number | null;
        NextExpiry: Date | null;
      }>(`
        DECLARE @MonthStart DATETIME = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);
        SELECT
          SUM(CASE WHEN cp.CreatedDate >= @MonthStart THEN 1 ELSE 0 END)                     AS CreatedThisMonth,
          SUM(CASE WHEN cp.CreatedDate >= @MonthStart AND cp.IsUsed = 1 THEN 1 ELSE 0 END)   AS PaidOfCreated,
          SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END)      AS Pending,
          SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE()
                   THEN ISNULL(pkg.Amount, 0) - ISNULL(cp.DiscountAmount, 0) ELSE 0 END)     AS PendingValue,
          SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE()
                    AND cp.ExpireDate < DATEADD(HOUR, 48, GETDATE()) THEN 1 ELSE 0 END)       AS ExpiringSoon,
          MIN(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() THEN cp.ExpireDate END) AS NextExpiry
        FROM Coupons cp
        LEFT JOIN [EStocks_Data].[dbo].[service_Packages] pkg ON pkg.PackageID = cp.PackageId
        WHERE cp.PartnerId = @PartnerId
          ${
            withTeam
              ? `OR EXISTS (
                  SELECT 1 FROM PartnerStaffMemberships ms
                  WHERE ms.PartnerId = @PartnerId AND ms.StaffPartnerId = cp.PartnerId
                    AND cp.CreatedDate >= ms.StartDate AND (ms.EndDate IS NULL OR cp.CreatedDate < ms.EndDate)
                )`
              : ""
          };
      `);
    const r = res.recordset[0];
    return {
      createdThisMonth: r?.CreatedThisMonth ?? 0,
      paidOfCreatedThisMonth: r?.PaidOfCreated ?? 0,
      pending: r?.Pending ?? 0,
      pendingValue: r?.PendingValue ?? 0,
      expiringSoon: r?.ExpiringSoon ?? 0,
      nextExpiry: r?.NextExpiry ?? null,
    };
  } catch (err) {
    console.error("[getLinkStats]", err);
    return { createdThisMonth: 0, paidOfCreatedThisMonth: 0, pending: 0, pendingValue: 0, expiringSoon: 0, nextExpiry: null };
  }
}

/** Doanh số tháng hiện tại tính cho một đối tác (gồm nhân viên), đã phân loại khách mới / gia hạn / … */
export const getCurrentMonthBreakdown = cache(async (partnerId: number): Promise<RevenueBreakdown> => {
  const map = await getMonthBreakdownMap(currentMonthKey(), partnerId);
  return map.get(partnerId) ?? emptyBreakdown();
});
