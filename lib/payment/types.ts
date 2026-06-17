export type CreatePaymentState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  result?: {
    code: string;
    shortLink: string;
    paymentLink: string;
    qrCodeUrl: string;
    orderId: number | null;
    accountNumber: string;
    qrPending: boolean;
    isMock: boolean;
    orderAmount: number;
    customerEmail: string | null;
    note: string | null;
  };
};

export const createPaymentInitialState: CreatePaymentState = { ok: false };
