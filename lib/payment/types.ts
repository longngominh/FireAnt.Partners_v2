export type PaymentResultKind = "purchase" | "upgrade";

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
  accountNumber: string;
  transferContent: string | null;
  qrPending: boolean;
  isMock: boolean;
  orderAmount: number;
  customerEmail: string | null;
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
};

export type CreatePaymentState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  result?: CreatePaymentResult;
};

export const createPaymentInitialState: CreatePaymentState = { ok: false };
