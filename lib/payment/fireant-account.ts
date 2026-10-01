import { randomBytes } from "node:crypto";

/**
 * Tạo tài khoản FireAnt HỘ khách qua API đăng ký sẵn có của FireAnt
 * (fireant-backend: FireAnt.Api/Controllers/api/Users/AuthenticationController.cs, host restv2):
 *
 *   POST /authentication/registration  → tạo user (UserName = Email) và gửi email
 *                                        "Xác nhận tài khoản FireAnt.vn".
 *   POST /authentication/password-reset → gửi email "Đặt lại mật khẩu FireAnt.vn". Khách đặt
 *                                        mật khẩu qua link này thì email cũng được xác nhận luôn
 *                                        (IdentityServer AccountController.ResetPassword) — từ
 *                                        đó mới đăng nhập được (UserService chặn email chưa xác nhận).
 *
 * Mật khẩu ban đầu sinh ngẫu nhiên, không lưu, không hiện cho ai: CTV không bao giờ biết mật
 * khẩu của khách. Đi qua API (UserManager) thay vì INSERT thẳng AspNetUsers để hash mật khẩu,
 * SecurityStamp, Normalized* do Identity tự lo.
 */

const TIMEOUT_MS = 15_000;

function apiBaseUrl(): string {
  return (process.env.FIREANT_API_URL ?? "https://restv2.fireant.vn").replace(/\/+$/, "");
}

/** API dùng CamelCasePropertyNamesContractResolver nhưng đọc cả hai kiểu cho chắc. */
type ApiResult = {
  succeeded?: boolean;
  Succeeded?: boolean;
  errorMessage?: string | null;
  ErrorMessage?: string | null;
};

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; message: string | null }> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  let data: ApiResult | null = null;
  try {
    data = (await res.json()) as ApiResult | null;
  } catch {
    data = null;
  }

  const message = data?.errorMessage ?? data?.ErrorMessage ?? null;
  if (!res.ok) return { ok: false, message: message ?? `FireAnt API trả về HTTP ${res.status}` };
  return { ok: (data?.succeeded ?? data?.Succeeded) === true, message };
}

export async function registerFireAntAccount(input: {
  email: string;
  name: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const password = randomBytes(24).toString("base64url");
  const result = await postJson("/authentication/registration", {
    name: input.name ?? "",
    email: input.email,
    password,
    confirmPassword: password,
  });
  return result.ok ? { ok: true } : { ok: false, message: result.message || "Đăng ký tài khoản không thành công." };
}

/** Gửi email để khách tự đặt mật khẩu (dùng luồng "Quên mật khẩu" của FireAnt). */
export async function sendPasswordSetupEmail(email: string): Promise<boolean> {
  const result = await postJson("/authentication/password-reset", { email });
  return result.ok;
}
