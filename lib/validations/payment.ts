import { z } from "zod";

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
  customerEmail: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập tài khoản FireAnt")
    .max(256, "Tài khoản FireAnt tối đa 256 ký tự"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
