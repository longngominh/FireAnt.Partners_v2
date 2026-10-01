import { z } from "zod";
import { SOURCE_MAX_LENGTH, normalizeSource } from "@/lib/payment/source";
import { VOUCHER_CODE_RE, normalizeVoucherCode } from "@/lib/payment/voucher-link";

const customerEmailSchema = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập tài khoản FireAnt")
  .max(256, "Tài khoản FireAnt tối đa 256 ký tự");

const noteSchema = z.string().trim().max(500, "Ghi chú tối đa 500 ký tự").optional().or(z.literal(""));

/** Nguồn khách (tuỳ chọn) — chuẩn hoá về null khi bỏ trống. */
export const sourceSchema = z
  .string()
  .transform((v) => normalizeSource(v))
  .refine((v) => v === null || v.length <= SOURCE_MAX_LENGTH, `Nguồn tối đa ${SOURCE_MAX_LENGTH} ký tự`);

/** Mã khuyến mại (tuỳ chọn) — in hoa, null khi bỏ trống. */
export const voucherCodeSchema = z
  .string()
  .transform((v) => normalizeVoucherCode(v))
  .refine((v) => v === "" || VOUCHER_CODE_RE.test(v), "Mã khuyến mại gồm 4–20 chữ cái hoặc chữ số")
  .transform((v) => (v === "" ? null : v));

/** Field bổ sung của form /payment/create (không có trong POST /api/coupons). */
export const createPaymentExtrasSchema = z.object({
  voucherCode: voucherCodeSchema,
  source: sourceSchema,
});

export const createPaymentSchema = z.object({
  packageId: z.coerce
    .number({ message: "Vui lòng chọn gói dịch vụ" })
    .int()
    .positive("Vui lòng chọn gói dịch vụ"),
  amount: z.coerce
    .number({ message: "Số tiền không hợp lệ" })
    .int("Số tiền phải là số nguyên")
    .min(10_000, "Số tiền tối thiểu 10.000 ₫")
    .max(2_000_000_000, "Số tiền vượt giới hạn"),
  customerEmail: customerEmailSchema,
  note: noteSchema,
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const createUpgradePaymentSchema = z.object({
  customerEmail: customerEmailSchema,
  tierServiceId: z.coerce
    .number({ message: "Vui lòng chọn hạng nâng cấp" })
    .int()
    .refine((v) => v === 34 || v === 35, "Hạng nâng cấp không hợp lệ"),
  option: z
    .string()
    .trim()
    .regex(/^(keep|pkg:\d+)$/, "Vui lòng chọn phương án nâng cấp"),
  note: noteSchema,
});

export type CreateUpgradePaymentInput = z.infer<typeof createUpgradePaymentSchema>;
