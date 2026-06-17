import { signRequest } from "./onepay-signer";

export type OnePayAccount = {
  accountNumber: string;
  bankId: string;
  orderRef: string;
  isMock: boolean;
};

export type OnePayClient = {
  createVirtualAccount(orderRef: string, partnerName: string): Promise<OnePayAccount>;
};

type OnePayAccountInfo = {
  account_number?: string;
  swift_code?: string;
};

type OnePayCreateUserResponse = {
  accounts?: OnePayAccountInfo | OnePayAccountInfo[];
  account?: OnePayAccountInfo;
  account_number?: string;
  error?: { message?: string };
  message?: string;
};

function mockOnePayClient(): OnePayClient {
  return {
    async createVirtualAccount(orderRef) {
      const numeric = orderRef.replace(/\D/g, "");
      const padded = numeric.padStart(6, "0").slice(-6);

      return {
        accountNumber: `9704180${padded}0`,
        bankId: process.env.ONEPAY_BANK_ID ?? "BIDVVNVX",
        orderRef,
        isMock: true,
      };
    },
  };
}

function pickAccount(data: OnePayCreateUserResponse): OnePayAccountInfo | undefined {
  if (Array.isArray(data.accounts)) return data.accounts[0];
  if (data.accounts && typeof data.accounts === "object") return data.accounts;
  if (data.account) return data.account;
  if (data.account_number) return { account_number: data.account_number };
  return undefined;
}

type OnePayConfig = {
  baseUrl: string;
  partner: string;
  partnerKey: string;
  region: string;
  service: string;
  bankId: string;
  business: {
    name: string;
    gender: string;
    address: string;
    mobileNumber: string;
    email: string;
    idCard: string;
    issueDate: string;
    issueBy: string;
  };
  expiresSeconds: string;
};

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`OnePay real mode requires env var ${key}.`);
  }
  return value;
}

function loadOnePayConfig(): OnePayConfig {
  return {
    baseUrl: process.env.ONEPAY_BASE_URL ?? "https://dev.onepay.vn",
    partner: requiredEnv("ONEPAY_PARTNER"),
    partnerKey: requiredEnv("ONEPAY_PARTNER_KEY"),
    region: process.env.ONEPAY_REGION ?? "onepay",
    service: process.env.ONEPAY_SERVICE ?? "paycollect",
    bankId: process.env.ONEPAY_BANK_ID ?? "BIDVVNVX",
    business: {
      name: process.env.ONEPAY_BUSINESS_NAME ?? "FireAnt",
      gender: process.env.ONEPAY_BUSINESS_GENDER ?? "male",
      address: process.env.ONEPAY_BUSINESS_ADDRESS ?? "",
      mobileNumber: process.env.ONEPAY_BUSINESS_MOBILE ?? "",
      email: process.env.ONEPAY_BUSINESS_EMAIL ?? "",
      idCard: process.env.ONEPAY_BUSINESS_ID_CARD ?? "",
      issueDate: process.env.ONEPAY_BUSINESS_ID_ISSUE_DATE ?? "01/01/2020 12:00:00 AM",
      issueBy: process.env.ONEPAY_BUSINESS_ID_ISSUE_BY ?? "",
    },
    expiresSeconds: process.env.ONEPAY_REQUEST_EXPIRES ?? "3600",
  };
}

async function sendSignedRequest(
  cfg: OnePayConfig,
  method: "PUT" | "GET",
  uri: string,
  bodyJson: string,
) {
  const url = `${cfg.baseUrl}${uri}`;
  const bodyBytes = new TextEncoder().encode(bodyJson);
  const dateTime = new Date();
  const signedHeaders = new Map<string, string>();
  const isoTs = formatIsoUtc(dateTime);

  signedHeaders.set("X-OP-Date", isoTs);
  signedHeaders.set("X-OP-Expires", cfg.expiresSeconds);

  const signed = signRequest({
    accessKeyId: cfg.partner,
    secretAccessKey: cfg.partnerKey,
    region: cfg.region,
    service: cfg.service,
    httpMethod: method,
    uri,
    queryParameters: new Map(),
    signedHeaders,
    payload: bodyBytes,
    dateTime,
  });

  const response = await fetch(url, {
    method,
    headers: {
      "X-OP-Date": isoTs,
      "X-OP-Authorization": signed.authorization,
      "X-OP-Expires": cfg.expiresSeconds,
      ...(method === "GET"
        ? {}
        : {
            "Content-Type": "application/json",
            "Content-Length": String(bodyBytes.byteLength),
          }),
    },
    body: method === "GET" ? undefined : bodyJson,
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as OnePayCreateUserResponse) : {};
  return { ok: response.ok, status: response.status, data, raw };
}

function isUserAlreadyExists(status: number, data: OnePayCreateUserResponse): boolean {
  if (status === 409) return true;
  const msg = (data.error?.message ?? data.message ?? "").toLowerCase();
  return msg.includes("already exist") || msg.includes("user exist");
}

function realOnePayClient(): OnePayClient {
  return {
    async createVirtualAccount(orderRef, partnerName) {
      const cfg = loadOnePayConfig();
      const uri = `/paycollect/api/v1/partners/${cfg.partner}/users/${orderRef}`;
      const bodyJson = JSON.stringify({
        name: cfg.business.name || partnerName,
        gender: cfg.business.gender,
        address: cfg.business.address,
        mobile_number: cfg.business.mobileNumber,
        email: cfg.business.email,
        id_card: cfg.business.idCard,
        issue_date: cfg.business.issueDate,
        issue_by: cfg.business.issueBy,
        bank_id: cfg.bankId,
        description: `FireAnt order ${orderRef}`,
      });

      let result = await sendSignedRequest(cfg, "PUT", uri, bodyJson);
      if (!result.ok && isUserAlreadyExists(result.status, result.data)) {
        result = await sendSignedRequest(cfg, "GET", uri, "");
      }
      if (!result.ok) {
        throw new Error(result.data.error?.message ?? result.data.message ?? `OnePay error ${result.status}`);
      }

      const account = pickAccount(result.data);
      const accountNumber = account?.account_number ?? "";
      if (!accountNumber) {
        throw new Error(`[onepay] response missing account_number: ${result.raw.slice(0, 300)}`);
      }

      return {
        accountNumber,
        bankId: account?.swift_code ?? cfg.bankId,
        orderRef,
        isMock: false,
      };
    },
  };
}

function formatIsoUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

export function getOnePayClient(): OnePayClient {
  return (process.env.ONEPAY_MODE ?? "mock") === "real"
    ? realOnePayClient()
    : mockOnePayClient();
}

export function isOnePayMock(): boolean {
  return (process.env.ONEPAY_MODE ?? "mock") !== "real";
}
