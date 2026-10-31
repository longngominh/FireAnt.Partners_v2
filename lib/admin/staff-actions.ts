"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { CONTRACT_TIER_LABELS, isContractTier } from "@/lib/commission";
import { getCurrentContract, setContractTier } from "@/lib/data/contracts";
import { getPartnerSummary } from "@/lib/data/portal";
import { hasStaffModel, STAFF_MIGRATION_HINT } from "@/lib/data/staff-model";
import {
  approveStaffApplication,
  endStaffMembership,
  rejectStaffApplication,
  reopenStaffMembership,
  StaffError,
} from "@/lib/staff/service";
import { currentMonthKey, formatMonthStart, parseMonthKey } from "@/lib/utils/month";

/**
 * Thao tác của quản lý FireAnt: chọn phụ lục cho đối tác, duyệt/từ chối đề xuất nhân viên,
 * ngừng hoặc mở lại ghi nhận một nhân viên.
 */

export type AdminActionResult = { ok: boolean; message?: string; error?: string };

async function requireAdminActor(): Promise<{ email: string } | { error: string }> {
  const session = await auth();
  if (session?.user.role !== "admin") return { error: "Không có quyền." };
  if (!(await hasStaffModel())) return { error: STAFF_MIGRATION_HINT };
  return { email: session.user.email ?? session.user.userId ?? "admin" };
}

function describe(err: unknown): string {
  if (err instanceof StaffError) return err.message;
  console.error("[admin staff action]", err);
  return "Không lưu được. Vui lòng thử lại.";
}

function revalidatePartner(partnerId: number) {
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath("/admin/partners");
  revalidatePath("/admin");
}

/** Chọn phụ lục: áp dụng cho cả tháng hiện tại, tính từ ngày 01; các tháng trước giữ phụ lục đã dùng. */
export async function setContractTierAction(partnerId: number, tier: string): Promise<AdminActionResult> {
  const actor = await requireAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  if (!isContractTier(tier)) return { ok: false, error: "Phụ lục không hợp lệ." };

  try {
    const summary = await getPartnerSummary(partnerId);
    if (!summary) return { ok: false, error: "Không tìm thấy đối tác." };
    if (summary.isStaff || summary.partnerType !== "collaborator") {
      return { ok: false, error: "Chỉ đối tác có hợp đồng mới chọn được phụ lục." };
    }
    const current = await getCurrentContract(partnerId);
    const month = currentMonthKey();
    if (current.tier === tier) return { ok: true, message: "Phụ lục không đổi." };

    await setContractTier({ partnerId, tier, changedBy: actor.email });
    revalidatePartner(partnerId);
    revalidatePath("/admin/payouts");
    const name = summary.fullName ?? summary.userName;
    return {
      ok: true,
      message: `Đã đổi phụ lục của ${name} sang ${CONTRACT_TIER_LABELS[tier]}, áp dụng cho cả tháng ${
        parseMonthKey(month).month
      } (từ ${formatMonthStart(month)}). Đối tác thấy ngay trong mục Thu nhập & hợp đồng.`,
    };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

export async function approveApplicationAction(applicationId: number): Promise<AdminActionResult> {
  const actor = await requireAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  try {
    const result = await approveStaffApplication({ applicationId, reviewedBy: actor.email });
    revalidatePath("/admin/approvals");
    revalidatePartner(result.partnerId);
    return {
      ok: true,
      message: `Đã duyệt ${result.name}. Nhân viên đăng nhập lại là tạo được link; doanh số tính cho đối tác từ bây giờ.`,
    };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

export async function rejectApplicationAction(applicationId: number, reason: string): Promise<AdminActionResult> {
  const actor = await requireAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  const text = String(reason ?? "").trim();
  if (!text) return { ok: false, error: "Nhập lý do từ chối để đối tác và nhân viên biết cách xử lý." };
  try {
    await rejectStaffApplication({ applicationId, reason: text, reviewedBy: actor.email });
    revalidatePath("/admin/approvals");
    revalidatePath("/admin");
    return { ok: true, message: "Đã từ chối đề xuất. Đối tác và người được đề xuất thấy lý do." };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

/** FireAnt ngừng ghi nhận nhân viên cho đối tác: có hiệu lực ngay, không lùi ngày. */
export async function adminEndStaffAction(
  partnerId: number,
  staffPartnerId: number,
  staffName: string,
): Promise<AdminActionResult> {
  const actor = await requireAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  try {
    await endStaffMembership({ staffPartnerId, partnerId, endedBy: actor.email, role: "admin" });
    revalidatePartner(partnerId);
    return { ok: true, message: `Đã ngừng ghi nhận ${staffName} từ hôm nay.` };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

/** Mở lại: khoảng ghi nhận mới bắt đầu từ lúc này, khoảng đã ngừng giữ nguyên. */
export async function adminReopenStaffAction(
  partnerId: number,
  staffPartnerId: number,
  staffName: string,
): Promise<AdminActionResult> {
  const actor = await requireAdminActor();
  if ("error" in actor) return { ok: false, error: actor.error };
  try {
    await reopenStaffMembership({ staffPartnerId, partnerId, startedBy: actor.email });
    revalidatePartner(partnerId);
    return { ok: true, message: `Đã mở lại ${staffName}. Doanh số tính cho đối tác từ bây giờ.` };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}
