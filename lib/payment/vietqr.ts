const VIETQR_HOST = "https://img.vietqr.io";
const DEFAULT_BANK_CODE = "970418";
const DEFAULT_TEMPLATE = "tvSJUQB";

export type VietQRParams = {
  accountNumber: string;
  amount: number;
  addInfo: string;
  accountName: string;
  bankCode?: string;
  template?: string;
};

export function buildVietQRUrl(params: VietQRParams): string {
  const accountNumber = params.accountNumber.trim();
  if (!accountNumber) throw new Error("buildVietQRUrl: accountNumber is required");
  if (params.amount < 0) throw new Error("buildVietQRUrl: amount must be >= 0");

  const bankCode = params.bankCode ?? DEFAULT_BANK_CODE;
  const template = params.template ?? DEFAULT_TEMPLATE;
  const query = new URLSearchParams({
    amount: String(params.amount),
    addInfo: params.addInfo,
    accountName: params.accountName,
  });

  return `${VIETQR_HOST}/image/${bankCode}-${accountNumber}-${template}.jpg?${query.toString()}`;
}

export function buildTransferContent(orderId: number): string {
  return `Thanh toan don hang FA${orderId}`;
}
