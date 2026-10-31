/** Mã số thuế: 10 chữ số, hoặc 13 chữ số với mã chi nhánh (có thể viết 0101234567-001). */
export const TAX_CODE_INVALID_MESSAGE = "Mã số thuế gồm 10 chữ số, hoặc 13 chữ số với mã chi nhánh.";

/** Chuẩn hóa mã số thuế người dùng nhập; null khi không hợp lệ. */
export function normalizeTaxCode(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, "");
  return /^\d{10}(-?\d{3})?$/.test(value) ? value : null;
}
