import { createHash, createHmac } from "node:crypto";

const SCHEME = "OWS1";
const ALGORITHM = "OWS1-HMAC-SHA256";
const TERMINATOR = "ows1_request";
const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

export type SignRequestParams = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  uri: string;
  queryParameters: Map<string, string>;
  signedHeaders: Map<string, string>;
  payload: Uint8Array | null;
  dateTime: Date;
};

export function uriEncode(value: string, encodeSlash: boolean): string {
  const bytes = Buffer.from(value, "utf-8");
  let result = "";

  for (const ch of bytes) {
    if (
      (ch >= 0x41 && ch <= 0x5a) ||
      (ch >= 0x61 && ch <= 0x7a) ||
      (ch >= 0x30 && ch <= 0x39) ||
      ch === 0x5f ||
      ch === 0x2d ||
      ch === 0x7e ||
      ch === 0x2e ||
      (ch === 0x2f && !encodeSlash)
    ) {
      result += String.fromCharCode(ch);
    } else {
      result += `%${ch.toString(16).toUpperCase()}`;
    }
  }

  return result;
}

function formatDateStamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatIsoTimestamp(date: Date): string {
  const dateStamp = formatDateStamp(date);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${dateStamp}T${hours}${minutes}${seconds}Z`;
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function signRequest(params: SignRequestParams): { authorization: string; isoDate: string } {
  const canonicalUri = uriEncode(params.uri, false);
  let canonicalQueryString = "";

  for (const [key, value] of params.queryParameters) {
    if (canonicalQueryString.length > 0) canonicalQueryString += "&";
    canonicalQueryString += `${uriEncode(key, true)}=${uriEncode(value, true)}`;
  }

  let canonicalHeaders = "";
  let signedHeaderNames = "";
  for (const [key, value] of params.signedHeaders) {
    canonicalHeaders += `${key.toLowerCase()}:${String(value).trim()}\n`;
    if (signedHeaderNames.length > 0) signedHeaderNames += ";";
    signedHeaderNames += key.toLowerCase();
  }

  let hashedPayload: string;
  if (params.payload === null) hashedPayload = UNSIGNED_PAYLOAD;
  else if (params.payload.length === 0) hashedPayload = EMPTY_BODY_SHA256;
  else hashedPayload = sha256Hex(Buffer.from(params.payload));

  const canonicalRequest = [
    params.httpMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaderNames,
    hashedPayload,
  ].join("\n");

  const isoDate = formatIsoTimestamp(params.dateTime);
  const dateStamp = formatDateStamp(params.dateTime);
  const scope = `${dateStamp}/${params.region}/${params.service}/${TERMINATOR}`;
  const stringToSign = [
    ALGORITHM,
    isoDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const dateKey = hmacSha256(SCHEME + params.secretAccessKey, dateStamp);
  const dateRegionKey = hmacSha256(dateKey, params.region);
  const dateRegionServiceKey = hmacSha256(dateRegionKey, params.service);
  const signingKey = hmacSha256(dateRegionServiceKey, TERMINATOR);
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  return {
    isoDate,
    authorization:
      `${ALGORITHM} ` +
      `Credential=${params.accessKeyId}/${scope},` +
      `SignedHeaders=${signedHeaderNames},` +
      `Signature=${signature}`,
  };
}
