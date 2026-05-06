import { customAlphabet } from "nanoid";

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const generate5  = customAlphabet(alphabet, 5);
const generate8  = customAlphabet(alphabet, 8);
const generate10 = customAlphabet(alphabet, 10);

export function generateShortCode(length: 5 | 8 | 10 = 5): string {
  if (length === 10) return generate10();
  if (length === 8)  return generate8();
  return generate5();
}

export function buildShortLink(baseUrl: string, code: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/p/${code}`;
}
