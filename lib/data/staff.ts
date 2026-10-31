import { getPool, sql } from "@/lib/db/sql";
import { PARTNER_STAFF_TYPE } from "@/lib/commission";
import { hasStaffModel } from "@/lib/data/staff-model";

/**
 * Nhân viên bán hàng của đối tác (một cấp, không có hạng):
 *   PartnerStaffApplications — đối tác đề xuất, FireAnt duyệt hoặc từ chối kèm lý do.
 *   PartnerStaffMemberships  — khoảng thời gian nhân viên được ghi nhận cho đối tác.
 * Nhân viên có dòng Partners riêng (PartnerType = partner_staff) để có link và doanh số riêng.
 * Mọi hàm đọc trả về rỗng khi CSDL chưa có migration (xem hasStaffModel).
 */

export type StaffMember = {
  staffPartnerId: number;
  membershipId: number;
  userName: string;
  name: string;
  phone: string | null;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
  endedBy: string | null;
  endedByRole: "partner" | "admin" | null;
  proposedAt: Date | null;
};

type MemberRow = {
  MembershipId: number;
  StaffPartnerId: number;
  StartDate: Date;
  EndDate: Date | null;
  EndedBy: string | null;
  EndedByRole: string | null;
  UserName: string;
  FullName: string | null;
  AppFullName: string | null;
  PhoneNumber: string | null;
  ProposedAt: Date | null;
};

function mapMember(r: MemberRow): StaffMember {
  return {
    staffPartnerId: r.StaffPartnerId,
    membershipId: r.MembershipId,
    userName: r.UserName,
    name: r.FullName?.trim() || r.AppFullName?.trim() || r.UserName,
    phone: r.PhoneNumber?.trim() || null,
    startDate: r.StartDate,
    endDate: r.EndDate ?? null,
    isActive: r.EndDate === null,
    endedBy: r.EndedBy ?? null,
    endedByRole: r.EndedByRole === "admin" ? "admin" : r.EndedByRole === "partner" ? "partner" : null,
    proposedAt: r.ProposedAt ?? null,
  };
}

/**
 * Nhân viên từng trực thuộc đối tác — mỗi người một dòng theo khoảng ghi nhận gần nhất
 * với đối tác này. Đang hoạt động xếp trước, rồi theo ngày bắt đầu.
 */
export async function listStaffMembers(partnerId: number): Promise<StaffMember[]> {
  if (!(await hasStaffModel())) return [];
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .query<MemberRow>(`
        SELECT
          m.MembershipId, m.StaffPartnerId, m.StartDate, m.EndDate, m.EndedBy, m.EndedByRole,
          p.UserName, p.FullName, a.FullName AS AppFullName, a.PhoneNumber, a.CreatedDate AS ProposedAt
        FROM PartnerStaffMemberships m
        INNER JOIN Partners p ON p.PartnerId = m.StaffPartnerId
        LEFT JOIN PartnerStaffApplications a ON a.ApplicationId = m.ApplicationId
        WHERE m.PartnerId = @PartnerId
        ORDER BY m.StaffPartnerId, m.StartDate DESC, m.MembershipId DESC;
      `);
    const seen = new Set<number>();
    const members: StaffMember[] = [];
    for (const row of res.recordset) {
      if (seen.has(row.StaffPartnerId)) continue;
      seen.add(row.StaffPartnerId);
      members.push(mapMember(row));
    }
    return members.sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        b.startDate.getTime() - a.startDate.getTime(),
    );
  } catch (err) {
    console.error("[listStaffMembers]", err);
    return [];
  }
}

export type StaffAffiliation = {
  membershipId: number;
  partnerId: number;
  partnerName: string;
  partnerUserName: string;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
};

/** Đối tác mà nhân viên đang (hoặc gần nhất) trực thuộc. */
export async function getStaffAffiliation(staffPartnerId: number): Promise<StaffAffiliation | null> {
  if (!(await hasStaffModel())) return null;
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("StaffPartnerId", sql.Int, staffPartnerId)
      .query<{
        MembershipId: number;
        PartnerId: number;
        StartDate: Date;
        EndDate: Date | null;
        UserName: string;
        FullName: string | null;
      }>(`
        SELECT TOP 1 m.MembershipId, m.PartnerId, m.StartDate, m.EndDate, p.UserName, p.FullName
        FROM PartnerStaffMemberships m
        INNER JOIN Partners p ON p.PartnerId = m.PartnerId
        WHERE m.StaffPartnerId = @StaffPartnerId
        ORDER BY CASE WHEN m.EndDate IS NULL THEN 0 ELSE 1 END, m.StartDate DESC, m.MembershipId DESC;
      `);
    const row = res.recordset[0];
    if (!row) return null;
    return {
      membershipId: row.MembershipId,
      partnerId: row.PartnerId,
      partnerName: row.FullName?.trim() || row.UserName,
      partnerUserName: row.UserName,
      startDate: row.StartDate,
      endDate: row.EndDate ?? null,
      isActive: row.EndDate === null,
    };
  } catch (err) {
    console.error("[getStaffAffiliation]", err);
    return null;
  }
}

/** Số nhân viên đang hoạt động của từng đối tác. */
export async function countActiveStaffByPartner(): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (!(await hasStaffModel())) return result;
  try {
    const pool = await getPool();
    const res = await pool.request().query<{ PartnerId: number; Total: number }>(`
      SELECT PartnerId, COUNT(*) AS Total
      FROM PartnerStaffMemberships
      WHERE EndDate IS NULL
      GROUP BY PartnerId;
    `);
    for (const row of res.recordset) result.set(row.PartnerId, row.Total);
  } catch (err) {
    console.error("[countActiveStaffByPartner]", err);
  }
  return result;
}

export type StaffStats = { active: number; partners: number; endedThisMonth: number };

/** Số liệu nhân viên toàn hệ thống cho bảng quản trị. */
export async function getStaffStats(): Promise<StaffStats> {
  if (!(await hasStaffModel())) return { active: 0, partners: 0, endedThisMonth: 0 };
  try {
    const pool = await getPool();
    const res = await pool.request().query<StaffStats>(`
      SELECT
        SUM(CASE WHEN EndDate IS NULL THEN 1 ELSE 0 END) AS active,
        COUNT(DISTINCT CASE WHEN EndDate IS NULL THEN PartnerId END) AS partners,
        SUM(CASE WHEN EndDate >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) THEN 1 ELSE 0 END) AS endedThisMonth
      FROM PartnerStaffMemberships;
    `);
    const row = res.recordset[0];
    return { active: row?.active ?? 0, partners: row?.partners ?? 0, endedThisMonth: row?.endedThisMonth ?? 0 };
  } catch (err) {
    console.error("[getStaffStats]", err);
    return { active: 0, partners: 0, endedThisMonth: 0 };
  }
}

// ---------------------------------------------------------------------------
// Đề xuất nhân viên
// ---------------------------------------------------------------------------

export const APPLICATION_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Chờ FireAnt duyệt",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
  cancelled: "Đã hủy",
};

export type StaffApplication = {
  id: number;
  partnerId: number;
  partnerName: string;
  userName: string;
  fullName: string | null;
  phone: string | null;
  note: string | null;
  status: ApplicationStatus;
  createdBy: string;
  createdAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  staffPartnerId: number | null;
};

type ApplicationRow = {
  ApplicationId: number;
  PartnerId: number;
  PartnerUserName: string;
  PartnerFullName: string | null;
  UserName: string;
  FullName: string | null;
  PhoneNumber: string | null;
  Note: string | null;
  Status: string;
  CreatedBy: string;
  CreatedDate: Date;
  ReviewedBy: string | null;
  ReviewedDate: Date | null;
  RejectReason: string | null;
  StaffPartnerId: number | null;
};

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return APPLICATION_STATUSES.includes(value as ApplicationStatus);
}

function mapApplication(r: ApplicationRow): StaffApplication {
  return {
    id: r.ApplicationId,
    partnerId: r.PartnerId,
    partnerName: r.PartnerFullName?.trim() || r.PartnerUserName,
    userName: r.UserName,
    fullName: r.FullName?.trim() || null,
    phone: r.PhoneNumber?.trim() || null,
    note: r.Note?.trim() || null,
    status: isApplicationStatus(r.Status) ? r.Status : "pending",
    createdBy: r.CreatedBy,
    createdAt: r.CreatedDate,
    reviewedBy: r.ReviewedBy ?? null,
    reviewedAt: r.ReviewedDate ?? null,
    rejectReason: r.RejectReason?.trim() || null,
    staffPartnerId: r.StaffPartnerId ?? null,
  };
}

const APPLICATION_SELECT = `
  SELECT
    a.ApplicationId, a.PartnerId, p.UserName AS PartnerUserName, p.FullName AS PartnerFullName,
    a.UserName, a.FullName, a.PhoneNumber, a.Note, a.Status, a.CreatedBy, a.CreatedDate,
    a.ReviewedBy, a.ReviewedDate, a.RejectReason, a.StaffPartnerId
  FROM PartnerStaffApplications a
  INNER JOIN Partners p ON p.PartnerId = a.PartnerId
`;

export async function listStaffApplications(filter: {
  partnerId?: number | null;
  status?: ApplicationStatus | "all";
  limit?: number;
}): Promise<StaffApplication[]> {
  if (!(await hasStaffModel())) return [];
  const { partnerId = null, status = "all", limit = 200 } = filter;
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .input("Status", sql.NVarChar(16), status === "all" ? null : status)
      .input("Limit", sql.Int, limit)
      .query<ApplicationRow>(`
        ${APPLICATION_SELECT.replace("SELECT", "SELECT TOP (@Limit)")}
        WHERE (@PartnerId IS NULL OR a.PartnerId = @PartnerId)
          AND (@Status IS NULL OR a.Status = @Status)
        ORDER BY CASE WHEN a.Status = N'pending' THEN 0 ELSE 1 END,
                 CASE WHEN a.Status = N'pending' THEN a.CreatedDate END ASC,
                 a.CreatedDate DESC;
      `);
    return res.recordset.map(mapApplication);
  } catch (err) {
    console.error("[listStaffApplications]", err);
    return [];
  }
}

export async function getStaffApplication(applicationId: number): Promise<StaffApplication | null> {
  if (!(await hasStaffModel())) return null;
  const pool = await getPool();
  const res = await pool
    .request()
    .input("ApplicationId", sql.Int, applicationId)
    .query<ApplicationRow>(`${APPLICATION_SELECT} WHERE a.ApplicationId = @ApplicationId;`);
  const row = res.recordset[0];
  return row ? mapApplication(row) : null;
}

/** Đề xuất mới nhất của một tài khoản (để báo trạng thái khi người đó đăng nhập). */
export async function getLatestApplicationForUser(userName: string): Promise<StaffApplication | null> {
  if (!userName || !(await hasStaffModel())) return null;
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("UserName", sql.NVarChar(256), userName)
      .query<ApplicationRow>(`
        ${APPLICATION_SELECT.replace("SELECT", "SELECT TOP 1")}
        WHERE a.UserName = @UserName AND a.Status IN (N'pending', N'rejected')
        ORDER BY a.CreatedDate DESC;
      `);
    const row = res.recordset[0];
    return row ? mapApplication(row) : null;
  } catch (err) {
    console.error("[getLatestApplicationForUser]", err);
    return null;
  }
}

export async function countStaffApplicationsByStatus(): Promise<Record<ApplicationStatus, number>> {
  const counts: Record<ApplicationStatus, number> = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
  if (!(await hasStaffModel())) return counts;
  try {
    const pool = await getPool();
    const res = await pool.request().query<{ Status: string; Total: number }>(`
      SELECT Status, COUNT(*) AS Total FROM PartnerStaffApplications GROUP BY Status;
    `);
    for (const row of res.recordset) {
      if (isApplicationStatus(row.Status)) counts[row.Status] = row.Total;
    }
  } catch (err) {
    console.error("[countStaffApplicationsByStatus]", err);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Kiểm tra tài khoản được đề xuất
// ---------------------------------------------------------------------------

export type StaffAccountCheck = {
  exists: boolean;
  /** UserName chuẩn trên FireAnt (đã tìm theo username hoặc email). */
  userName: string | null;
  createdAt: Date | null;
  /** Tài khoản FireAnt đã xác thực (AspNetUsers.EmailConfirmed). */
  verified: boolean;
  phone: string | null;
  phoneConfirmed: boolean;
  /** Dòng Partners sẵn có của tài khoản này (nếu có). */
  existingPartnerId: number | null;
  existingPartnerType: string | null;
  /** Đối tác đang ghi nhận tài khoản này (khoảng đang mở), nếu có. */
  activePartnerId: number | null;
  activePartnerName: string | null;
};

export async function checkStaffAccount(userNameOrEmail: string): Promise<StaffAccountCheck> {
  const empty: StaffAccountCheck = {
    exists: false,
    userName: null,
    createdAt: null,
    verified: false,
    phone: null,
    phoneConfirmed: false,
    existingPartnerId: null,
    existingPartnerType: null,
    activePartnerId: null,
    activePartnerName: null,
  };
  const value = userNameOrEmail.trim();
  if (!value) return empty;

  const pool = await getPool();
  const account = await pool
    .request()
    .input("Value", sql.NVarChar(256), value)
    .query<{
      UserName: string;
      CreatedOnUtc: Date | null;
      EmailConfirmed: boolean | number | null;
      PhoneNumber: string | null;
      PhoneNumberConfirmed: boolean | number | null;
    }>(`
      SELECT TOP 1 UserName, CreatedOnUtc, EmailConfirmed, PhoneNumber, PhoneNumberConfirmed
      FROM NEWFA.FireAnt_Identity.dbo.AspNetUsers
      WHERE UserName = @Value OR Email = @Value;
    `);
  const row = account.recordset[0];
  if (!row?.UserName) return empty;

  const result: StaffAccountCheck = {
    ...empty,
    exists: true,
    userName: row.UserName,
    createdAt: row.CreatedOnUtc ?? null,
    verified: row.EmailConfirmed === true || row.EmailConfirmed === 1,
    phone: row.PhoneNumber?.trim() || null,
    phoneConfirmed: row.PhoneNumberConfirmed === true || row.PhoneNumberConfirmed === 1,
  };

  const partner = await pool
    .request()
    .input("UserName", sql.NVarChar(256), row.UserName)
    .query<{ PartnerId: number; PartnerType: string | null }>(`
      SELECT TOP 1 PartnerId, PartnerType FROM Partners WHERE UserName = @UserName;
    `);
  const existing = partner.recordset[0];
  if (!existing) return result;
  result.existingPartnerId = existing.PartnerId;
  result.existingPartnerType = existing.PartnerType ?? null;

  if (existing.PartnerType === PARTNER_STAFF_TYPE && (await hasStaffModel())) {
    const membership = await pool
      .request()
      .input("StaffPartnerId", sql.Int, existing.PartnerId)
      .query<{ PartnerId: number; UserName: string; FullName: string | null }>(`
        SELECT TOP 1 m.PartnerId, p.UserName, p.FullName
        FROM PartnerStaffMemberships m
        INNER JOIN Partners p ON p.PartnerId = m.PartnerId
        WHERE m.StaffPartnerId = @StaffPartnerId AND m.EndDate IS NULL;
      `);
    const open = membership.recordset[0];
    if (open) {
      result.activePartnerId = open.PartnerId;
      result.activePartnerName = open.FullName?.trim() || open.UserName;
    }
  }
  return result;
}

/** Tài khoản đang là đối tác có hợp đồng riêng với FireAnt (CTV hoặc NVKD). */
export function isContractHolderAccount(check: StaffAccountCheck): boolean {
  return check.existingPartnerId !== null && check.existingPartnerType !== PARTNER_STAFF_TYPE;
}

/**
 * Tên người bán cho cột "Người tạo"/"Người bán" ở cổng đối tác: chính đối tác là "Bạn",
 * nhân viên đã ngừng có ghi chú.
 */
export async function getSellerLabels(partnerId: number): Promise<Record<number, string>> {
  const labels: Record<number, string> = { [partnerId]: "Bạn" };
  for (const member of await listStaffMembers(partnerId)) {
    labels[member.staffPartnerId] = member.isActive ? member.name : `${member.name} (đã ngừng)`;
  }
  return labels;
}

/** Tên và tài khoản của mọi nhân viên bán hàng (PartnerType = partner_staff) — cho bảng kê đơn. */
export async function getStaffDirectory(): Promise<Map<number, { name: string; userName: string }>> {
  const result = new Map<number, { name: string; userName: string }>();
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("StaffType", sql.NVarChar(32), PARTNER_STAFF_TYPE)
      .query<{ PartnerId: number; UserName: string; FullName: string | null }>(`
        SELECT PartnerId, UserName, FullName FROM Partners WHERE PartnerType = @StaffType;
      `);
    for (const row of res.recordset) {
      result.set(row.PartnerId, { name: row.FullName?.trim() || row.UserName, userName: row.UserName });
    }
  } catch (err) {
    console.error("[getStaffDirectory]", err);
  }
  return result;
}

export type StaffLinkCounts = { thisMonth: number; pending: number };

/** Số link mỗi nhân viên tạo trong tháng và số link đang chờ thanh toán (chỉ link tạo khi được ghi nhận). */
export async function getStaffLinkCounts(partnerId: number): Promise<Map<number, StaffLinkCounts>> {
  const result = new Map<number, StaffLinkCounts>();
  if (!(await hasStaffModel())) return result;
  try {
    const pool = await getPool();
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, partnerId)
      .query<{ PartnerId: number; ThisMonth: number; Pending: number }>(`
        DECLARE @MonthStart DATETIME = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);
        SELECT
          cp.PartnerId,
          SUM(CASE WHEN cp.CreatedDate >= @MonthStart THEN 1 ELSE 0 END) AS ThisMonth,
          SUM(CASE WHEN cp.IsUsed = 0 AND cp.ExpireDate >= GETDATE() THEN 1 ELSE 0 END) AS Pending
        FROM Coupons cp
        WHERE EXISTS (
          SELECT 1 FROM PartnerStaffMemberships ms
          WHERE ms.PartnerId = @PartnerId AND ms.StaffPartnerId = cp.PartnerId
            AND cp.CreatedDate >= ms.StartDate AND (ms.EndDate IS NULL OR cp.CreatedDate < ms.EndDate)
        )
        GROUP BY cp.PartnerId;
      `);
    for (const row of res.recordset) {
      result.set(row.PartnerId, { thisMonth: row.ThisMonth ?? 0, pending: row.Pending ?? 0 });
    }
  } catch (err) {
    console.error("[getStaffLinkCounts]", err);
  }
  return result;
}
