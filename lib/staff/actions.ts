"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { checkStaffAccount } from "@/lib/data/staff";
import { hasStaffModel, STAFF_MIGRATION_HINT } from "@/lib/data/staff-model";
import {
  cancelStaffApplication,
  endStaffMembership,
  proposeStaff,
  StaffError,
  staffAccountProblem,
} from "@/lib/staff/service";
import { normalizeVnPhone, PHONE_INVALID_MESSAGE } from "@/lib/payment/phone";

/**
 * Thao tác của đối tác với nhân viên bán hàng của mình: đề xuất (FireAnt duyệt), hủy đề xuất,
 * ngừng hợp tác. Nhân viên và quản lý FireAnt không dùng các action này.
 */

export type StaffActionState = { ok: boolean; message?: string; error?: string };

async function requirePartnerActor(): Promise<{ partnerId: number; email: string } | { error: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang." };
  if (session.user.role === "staff" || session.user.role === "applicant") {
    return { error: "Chỉ đối tác mới quản lý được nhân viên." };
  }
  const partnerId = Number(session.user.partnerId);
  if (!session.user.partnerId || !Number.isInteger(partnerId)) return { error: "Không xác định được đối tác." };
  if (!(await hasStaffModel())) return { error: STAFF_MIGRATION_HINT };
  return { partnerId, email: session.user.email ?? session.user.userId ?? "" };
}

function describe(err: unknown): string {
  if (err instanceof StaffError) return err.message;
  console.error("[staff action]", err);
  return "Không lưu được. Vui lòng thử lại.";
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export type StaffAccountPreview =
  | { status: "ok"; userName: string; createdAt: string | null; phoneMasked: string | null }
  | { status: "problem"; message: string };

/** Kiểm tra trước tài khoản khi đối tác nhập email nhân viên (form đề xuất). */
export async function previewStaffAccountAction(email: string): Promise<StaffAccountPreview> {
  const actor = await requirePartnerActor();
  if ("error" in actor) return { status: "problem", message: actor.error };
  const value = String(email ?? "").trim();
  if (!value) return { status: "problem", message: "Nhập email tài khoản FireAnt của nhân viên." };
  try {
    const check = await checkStaffAccount(value);
    const problem = staffAccountProblem(check, actor.partnerId);
    if (problem) return { status: "problem", message: problem };
    return {
      status: "ok",
      userName: check.userName ?? value,
      createdAt: check.createdAt ? check.createdAt.toISOString() : null,
      phoneMasked: check.phone ? `•••${check.phone.slice(-3)}` : null,
    };
  } catch (err) {
    return { status: "problem", message: describe(err) };
  }
}

export async function proposeStaffAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const actor = await requirePartnerActor();
  if ("error" in actor) return { ok: false, error: actor.error };

  const email = text(formData, "email");
  const fullName = text(formData, "fullName");
  const rawPhone = text(formData, "phone");
  const note = text(formData, "note") || null;
  if (!email) return { ok: false, error: "Nhập email tài khoản FireAnt của nhân viên." };
  if (!fullName) return { ok: false, error: "Nhập họ tên nhân viên." };
  const phone = rawPhone ? normalizeVnPhone(rawPhone) : null;
  if (rawPhone && !phone) return { ok: false, error: PHONE_INVALID_MESSAGE };

  try {
    await proposeStaff({
      partnerId: actor.partnerId,
      userNameOrEmail: email,
      fullName,
      phone,
      note,
      createdBy: actor.email,
    });
    revalidatePath("/team");
    revalidatePath("/admin/approvals");
    return { ok: true, message: `Đã gửi đề xuất ${fullName}. FireAnt sẽ kiểm tra và duyệt.` };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

export async function cancelProposalAction(applicationId: number): Promise<StaffActionState> {
  const actor = await requirePartnerActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  try {
    await cancelStaffApplication({ applicationId, partnerId: actor.partnerId });
    revalidatePath("/team");
    revalidatePath("/admin/approvals");
    return { ok: true, message: "Đã hủy đề xuất. FireAnt không xử lý đề xuất này nữa." };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

/** Ngừng hợp tác: có hiệu lực ngay, không lùi ngày. */
export async function endStaffAction(staffPartnerId: number, staffName: string): Promise<StaffActionState> {
  const actor = await requirePartnerActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  try {
    await endStaffMembership({ staffPartnerId, partnerId: actor.partnerId, endedBy: actor.email, role: "partner" });
    revalidatePath("/team");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `Đã ngừng hợp tác với ${staffName} từ hôm nay. Doanh số từ bây giờ không còn tính cho bạn.`,
    };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}
