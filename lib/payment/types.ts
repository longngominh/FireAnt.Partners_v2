export type PaymentResultKind = "purchase" | "upgrade";

/** Mã khuyến mại đã áp (hoặc sẽ áp) vào đơn mua gói. */
export type AppliedVoucher = {
  code: string;
  /** Mô tả mã, ví dụ "Giảm 10% (tối đa 500.000 ₫)" */
  title: string;
  /** Số tiền trừ vào giá gói — 0 với mã tặng ngày sử dụng */
  discountAmount: number;
  /** Lợi ích của đơn này, ví dụ "Giảm 500.000 ₫" / "Tặng thêm 30 ngày sử dụng" */
  benefit: string;
};

/**
 * Kết quả bấm "Áp dụng" mã khuyến mại ở /payment/create. Kèm gói + khách đã dùng để kiểm
 * tra: đổi gói hoặc khách thì kết quả không còn đúng, phải kiểm tra lại.
 */
export type VoucherPreview =
  | ({
      ok: true;
      packageId: number;
      customer: string;
      listAmount: number;
      /** Số tiền khách cần chuyển sau khi trừ mã */
      finalAmount: number;
      expiresAt: string | null;
      remainingUses: number | null;
    } & AppliedVoucher)
  | {
      ok: false;
      code: string;
      packageId: number;
      customer: string;
      error: string;
      /** Ô cần báo lỗi — khách chưa có tài khoản thì lỗi nằm ở ô tài khoản */
      field: "voucherCode" | "customerEmail";
    };

/**
 * Tra tài khoản khách khi CTV nhập ở /payment/create. Số điện thoại của tài khoản không bao
 * giờ ra client nguyên vẹn — chỉ có cờ + bản che 3 số cuối.
 */
export type CustomerLookup =
  | {
      status: "account";
      /** Chuỗi CTV đã nhập (để biết kết quả còn khớp ô nhập không) */
      input: string;
      userName: string;
      hasPhone: boolean;
      maskedPhone: string | null;
    }
  | { status: "new-email"; input: string; email: string }
  | { status: "invalid"; input: string; error: string };

export type CreateCustomerAccountResult =
  | {
      ok: true;
      userName: string;
      /** Đã ghi được số vào tài khoản chưa (thiếu quyền ghi qua linked server thì false) */
      phoneSaved: boolean;
      maskedPhone: string | null;
      /** Đã gửi email để khách tự đặt mật khẩu chưa */
      setupEmailSent: boolean;
    }
  | {
      ok: false;
      error: string;
      field?: "email" | "name" | "phone";
      /** Email đã có tài khoản — form chuyển sang dùng tài khoản này */
      existingUserName?: string;
    };

export type CreatePaymentResult = {
  kind: PaymentResultKind;
  code: string;
  shortLink: string;
  /** Link lưu trong DB (purchase: checkout Corporate; upgrade: trang QR công khai kèm tham số) */
  paymentLink: string;
  /** Link gửi cho khách hàng */
  publicLink: string;
  qrCodeUrl: string;
  orderId: number | null;
  /** Mã đơn hiển thị cạnh QR — "ED15387365" (khóa học) / "FA15387365", trùng nội dung chuyển khoản */
  orderRef: string | null;
  accountNumber: string;
  transferContent: string | null;
  qrPending: boolean;
  isMock: boolean;
  orderAmount: number;
  customerEmail: string | null;
  /** Email/username khách đã có tài khoản FireAnt chưa (chưa có thì phải nhắc khách đăng ký) */
  customerHasAccount: boolean;
  note: string | null;
  /** Hạng dịch vụ của gói (33/34/35/39) */
  serviceId: number | null;
  /** Tên gói hiển thị, ví dụ "Chuyên nghiệp · 12 tháng" */
  packageLabel: string;
  /** Nâng cấp: mô tả phương án; hạn mới dự kiến (ISO) */
  modeLabel: string | null;
  expectedEndDate: string | null;
  /** Nâng cấp: hạng hiện tại của khách */
  fromServiceId: number | null;
  /** Mua gói: giá niêm yết trước khi trừ mã khuyến mại (orderAmount là số khách cần chuyển) */
  listAmount: number | null;
  voucher: AppliedVoucher | null;
  /** Nguồn khách CTV gắn cho link */
  source: string | null;
  /** Số điện thoại CTV nhập cho khách (null = dùng số có sẵn trong tài khoản) */
  customerPhone: string | null;
  /** Cảnh báo khi chưa lưu được số vào tài khoản FireAnt */
  phoneNotice: string | null;
};

export type CreatePaymentState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  result?: CreatePaymentResult;
};

export const createPaymentInitialState: CreatePaymentState = { ok: false };
