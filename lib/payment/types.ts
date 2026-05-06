export type CreatePaymentState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  result?: {
    code: string;
    shortLink: string;
    qrDataUrl: string;
    orderAmount: number;
    customerEmail: string | null;
    note: string | null;
  };
};

export const createPaymentInitialState: CreatePaymentState = { ok: false };
