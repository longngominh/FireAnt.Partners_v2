import { getPool, sql } from "@/lib/db/sql";
import { PARTNER_STAFF_TYPE } from "@/lib/commission";
import {
  checkStaffAccount,
  getStaffApplication,
  isContractHolderAccount,
  type StaffAccountCheck,
} from "@/lib/data/staff";

/**
 * Ghi dữ liệu nhân viên bán hàng. Không kiểm tra quyền — server action gọi tới (đối tác hoặc
 * quản lý FireAnt) tự kiểm tra phạm vi trước. Truy vấn sang tài khoản FireAnt (linked server)
 * luôn chạy ngoài giao dịch để không thành giao dịch phân tán.
 */

export class StaffError extends Error {}

/** Lý do không thể nhận tài khoản làm nhân viên của `partnerId`; null = hợp lệ. */
export function staffAccountProblem(check: StaffAccountCheck, partnerId: number): string | null {
  if (!check.exists) return "Không tìm thấy tài khoản FireAnt với email này.";
  if (!check.verified) return "Tài khoản FireAnt chưa xác thực.";
  if (check.existingPartnerId === partnerId) return "Đây là tài khoản của chính đối tác.";
  if (isContractHolderAccount(check)) return "Tài khoản đang là đối tác có hợp đồng riêng với FireAnt.";
  if (check.activePartnerId === partnerId) return "Người này đã là nhân viên của đối tác.";
  if (check.activePartnerId !== null) return "Tài khoản đang thuộc một đối tác khác.";
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /duplicate key|UNIQUE/i.test(err.message);
}

export async function proposeStaff(params: {
  partnerId: number;
  userNameOrEmail: string;
  fullName: string;
  phone: string | null;
  note: string | null;
  createdBy: string;
}): Promise<{ applicationId: number; userName: string }> {
  const check = await checkStaffAccount(params.userNameOrEmail);
  const problem = staffAccountProblem(check, params.partnerId);
  if (problem) throw new StaffError(problem);

  const pool = await getPool();
  try {
    const res = await pool
      .request()
      .input("PartnerId", sql.Int, params.partnerId)
      .input("UserName", sql.NVarChar(256), check.userName)
      .input("FullName", sql.NVarChar(200), params.fullName)
      .input("PhoneNumber", sql.NVarChar(20), params.phone)
      .input("Note", sql.NVarChar(1000), params.note)
      .input("CreatedBy", sql.NVarChar(256), params.createdBy)
      .query<{ ApplicationId: number }>(`
        INSERT INTO PartnerStaffApplications (PartnerId, UserName, FullName, PhoneNumber, Note, CreatedBy)
        VALUES (@PartnerId, @UserName, @FullName, @PhoneNumber, @Note, @CreatedBy);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS ApplicationId;
      `);
    return { applicationId: res.recordset[0]?.ApplicationId ?? 0, userName: check.userName ?? "" };
  } catch (err) {
    if (isUniqueViolation(err)) throw new StaffError("Tài khoản này đã có một đề xuất đang chờ FireAnt duyệt.");
    throw err;
  }
}

export async function cancelStaffApplication(params: { applicationId: number; partnerId: number }): Promise<void> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("ApplicationId", sql.Int, params.applicationId)
    .input("PartnerId", sql.Int, params.partnerId)
    .query(`
      UPDATE PartnerStaffApplications
      SET Status = N'cancelled'
      WHERE ApplicationId = @ApplicationId AND PartnerId = @PartnerId AND Status = N'pending';
    `);
  if ((res.rowsAffected[0] ?? 0) === 0) throw new StaffError("Đề xuất không còn ở trạng thái chờ duyệt.");
}

/**
 * Duyệt: tạo (hoặc dùng lại) dòng Partners loại nhân viên và mở khoảng ghi nhận từ lúc duyệt.
 * Trả về PartnerId của nhân viên.
 */
export async function approveStaffApplication(params: {
  applicationId: number;
  reviewedBy: string;
}): Promise<{ staffPartnerId: number; partnerId: number; name: string }> {
  const application = await getStaffApplication(params.applicationId);
  if (!application || application.status !== "pending") {
    throw new StaffError("Đề xuất không còn ở trạng thái chờ duyệt.");
  }
  const check = await checkStaffAccount(application.userName);
  const problem = staffAccountProblem(check, application.partnerId);
  if (problem) throw new StaffError(`Không thể duyệt: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`);

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    let staffPartnerId = check.existingPartnerId;
    if (staffPartnerId !== null) {
      await new sql.Request(tx)
        .input("PartnerId", sql.Int, staffPartnerId)
        .input("FullName", sql.NVarChar(200), application.fullName)
        .query(`
          UPDATE Partners
          SET IsActive = 1, FullName = COALESCE(FullName, @FullName)
          WHERE PartnerId = @PartnerId;
        `);
    } else {
      const created = await new sql.Request(tx)
        .input("UserName", sql.NVarChar(256), check.userName)
        .input("PartnerType", sql.NVarChar(32), PARTNER_STAFF_TYPE)
        .input("FullName", sql.NVarChar(200), application.fullName)
        // SCOPE_IDENTITY thay vì OUTPUT: OUTPUT không INTO bị chặn nếu bảng Partners có trigger.
        .query<{ PartnerId: number }>(`
          INSERT INTO Partners (UserName, PartnerType, IsActive, CreatedDate, FullName)
          VALUES (@UserName, @PartnerType, 1, GETDATE(), @FullName);
          SELECT CAST(SCOPE_IDENTITY() AS INT) AS PartnerId;
        `);
      staffPartnerId = created.recordset[0]?.PartnerId ?? null;
      if (staffPartnerId === null) throw new StaffError("Không tạo được tài khoản nhân viên.");
    }

    await new sql.Request(tx)
      .input("StaffPartnerId", sql.Int, staffPartnerId)
      .input("PartnerId", sql.Int, application.partnerId)
      .input("ApplicationId", sql.Int, application.id)
      .input("StartedBy", sql.NVarChar(256), params.reviewedBy)
      .query(`
        INSERT INTO PartnerStaffMemberships (StaffPartnerId, PartnerId, ApplicationId, StartDate, StartedBy)
        VALUES (@StaffPartnerId, @PartnerId, @ApplicationId, GETDATE(), @StartedBy);
      `);

    const updated = await new sql.Request(tx)
      .input("ApplicationId", sql.Int, application.id)
      .input("ReviewedBy", sql.NVarChar(256), params.reviewedBy)
      .input("StaffPartnerId", sql.Int, staffPartnerId)
      .query(`
        UPDATE PartnerStaffApplications
        SET Status = N'approved', ReviewedBy = @ReviewedBy, ReviewedDate = GETDATE(), StaffPartnerId = @StaffPartnerId
        WHERE ApplicationId = @ApplicationId AND Status = N'pending';
      `);
    if ((updated.rowsAffected[0] ?? 0) === 0) throw new StaffError("Đề xuất không còn ở trạng thái chờ duyệt.");

    await tx.commit();
    return {
      staffPartnerId,
      partnerId: application.partnerId,
      name: application.fullName ?? application.userName,
    };
  } catch (err) {
    await tx.rollback().catch(() => {});
    if (isUniqueViolation(err)) throw new StaffError("Tài khoản đang thuộc một đối tác khác.");
    throw err;
  }
}

export async function rejectStaffApplication(params: {
  applicationId: number;
  reason: string;
  reviewedBy: string;
}): Promise<void> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("ApplicationId", sql.Int, params.applicationId)
    .input("Reason", sql.NVarChar(500), params.reason.slice(0, 500))
    .input("ReviewedBy", sql.NVarChar(256), params.reviewedBy)
    .query(`
      UPDATE PartnerStaffApplications
      SET Status = N'rejected', RejectReason = @Reason, ReviewedBy = @ReviewedBy, ReviewedDate = GETDATE()
      WHERE ApplicationId = @ApplicationId AND Status = N'pending';
    `);
  if ((res.rowsAffected[0] ?? 0) === 0) throw new StaffError("Đề xuất không còn ở trạng thái chờ duyệt.");
}

/** Ngừng hợp tác: đóng khoảng ghi nhận đang mở từ ngay lúc này (không lùi ngày). */
export async function endStaffMembership(params: {
  staffPartnerId: number;
  partnerId: number;
  endedBy: string;
  role: "partner" | "admin";
}): Promise<void> {
  const pool = await getPool();
  const res = await pool
    .request()
    .input("StaffPartnerId", sql.Int, params.staffPartnerId)
    .input("PartnerId", sql.Int, params.partnerId)
    .input("EndedBy", sql.NVarChar(256), params.endedBy)
    .input("EndedByRole", sql.NVarChar(16), params.role)
    .query(`
      UPDATE PartnerStaffMemberships
      SET EndDate = GETDATE(), EndedBy = @EndedBy, EndedByRole = @EndedByRole
      WHERE StaffPartnerId = @StaffPartnerId AND PartnerId = @PartnerId AND EndDate IS NULL;
    `);
  if ((res.rowsAffected[0] ?? 0) === 0) throw new StaffError("Nhân viên này không còn được ghi nhận cho đối tác.");
}

/** FireAnt mở lại: một khoảng ghi nhận mới bắt đầu từ lúc này. */
export async function reopenStaffMembership(params: {
  staffPartnerId: number;
  partnerId: number;
  startedBy: string;
}): Promise<void> {
  const pool = await getPool();
  try {
    await pool
      .request()
      .input("StaffPartnerId", sql.Int, params.staffPartnerId)
      .input("PartnerId", sql.Int, params.partnerId)
      .input("StartedBy", sql.NVarChar(256), params.startedBy)
      .query(`
        INSERT INTO PartnerStaffMemberships (StaffPartnerId, PartnerId, StartDate, StartedBy)
        VALUES (@StaffPartnerId, @PartnerId, GETDATE(), @StartedBy);
      `);
  } catch (err) {
    if (isUniqueViolation(err)) throw new StaffError("Nhân viên này đang được ghi nhận cho một đối tác.");
    throw err;
  }
}
