import { z } from "zod";

const customerEmailSchema = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập tài khoản FireAnt")
  .max(256, "Tài khoản FireAnt tối đa 256 ký tự");

const noteSchema = z.string().trim().max(500, "Ghi chú tối đa 500 ký tự").optional().or(z.literal(""));

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
