import { pinyin } from "pinyin-pro";

/**
 * Deterministic Hanyu-Pinyin sort-key policy for Library title ordering.
 *
 * - Chinese Han characters map to tone-insensitive, case-insensitive pinyin
 *   syllables (pinyin-pro's context-aware dictionary), so 汉 titles sort by
 *   pronunciation rather than Unicode code points.
 * - Latin letters and digits are lowercased and preserved, so Latin-script
 *   titles sort naturally A–Z inside the same normalized key system; digits
 *   keep plain ASCII ordering (one explicit deterministic numeric policy:
 *   "2" < "10" because "1" < "2").
 * - Punctuation, book-title brackets, and spacing are dropped so they never
 *   dominate ordering.
 * - Scripts outside the pinyin dictionary fall back to their NFC-normalized
 *   characters (Unicode ordering).
 *
 * This is the query-time sort key registered as the deterministic SQL
 * function `pinyin_key`; no stored key column or migration is required.
 */
export function pinyinSortKey(value: string): string {
  const normalized = value.normalize("NFC");
  let key = "";
  for (const element of pinyin(normalized, { toneType: "none", type: "array", v: false }) as string[]) {
    for (const character of element) {
      const lower = character.toLowerCase();
      if (/[a-z0-9]/.test(lower)) {
        key += lower;
      } else if (/[\p{L}\p{N}]/u.test(character)) {
        // Unsupported script: keep the normalized character itself so ordering
        // falls back deterministically to Unicode code points.
        key += character;
      }
      // Everything else (punctuation, brackets, spacing, symbols) is dropped.
    }
  }
  return key;
}
