/**
 * Nguồn khách (Coupons.Source) — CTV gắn khi tạo link để biết khách đến từ kênh nào
 * (Zalo, TikTok, Facebook, Team 1…). Nhập tự do; các kênh phổ biến có sẵn làm gợi ý,
 * cộng thêm những nguồn CTV đã dùng trước đó.
 *
 * Module này không import gì phía server — dùng được ở cả client.
 */

export const SOURCE_MAX_LENGTH = 50;

export const SOURCE_PRESETS = ["Zalo", "TikTok", "Facebook"] as const;

/** Giá trị ô lọc (?source=) cho link / khách chưa gắn nguồn. */
export const SOURCE_NONE = "__none";

/**
 * Bỏ khoảng trắng thừa; trùng một kênh có sẵn (không phân biệt hoa/thường) thì dùng
 * đúng cách viết của kênh đó để thống kê không tách "zalo" và "Zalo" thành hai nguồn.
 */
export function normalizeSource(input: string | null | undefined): string | null {
  const value = (input ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  const preset = SOURCE_PRESETS.find((p) => p.toLowerCase() === value.toLowerCase());
  return preset ?? value;
}

/** Gộp nguồn vừa dùng trong phiên vào gợi ý đã có (kênh có sẵn vẫn đứng đầu). */
export function mergeSourceSuggestions(recent: string[], suggestions: string[]): string[] {
  return sourceSuggestions([...recent, ...suggestions]);
}

/** Gợi ý hiển thị dưới ô nhập: kênh có sẵn trước, rồi tới nguồn CTV đã dùng (bỏ trùng). */
export function sourceSuggestions(history: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...SOURCE_PRESETS, ...history]) {
    const value = normalizeSource(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}
