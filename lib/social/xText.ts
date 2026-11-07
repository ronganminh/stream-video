// The text of an X post: the caption, then a link to the video page.
// X counts characters by weight (twitter-text v3): code points up to U+10FF
// (ASCII, Latin-1, Latin Extended A/B, so "Đ") and common punctuation weigh
// 1; everything else weighs 2, including Vietnamese letters from Latin
// Extended Additional ("ầ", "ứ"), "…", CJK and emoji; every URL weighs 23.
// Free accounts get 280; the caption is trimmed to fit.

export const X_MAX_WEIGHT = 280;
const URL_WEIGHT = 23;

function charWeight(codePoint: number): number {
  if (
    codePoint <= 0x10ff ||
    (codePoint >= 0x2000 && codePoint <= 0x200d) ||
    (codePoint >= 0x2010 && codePoint <= 0x201f) ||
    (codePoint >= 0x2032 && codePoint <= 0x2037)
  ) {
    return 1;
  }
  return 2;
}

/** X's weighted length of plain text (no URLs inside). */
export function xWeight(text: string): number {
  let weight = 0;
  for (const char of text.normalize("NFC")) weight += charWeight(char.codePointAt(0)!);
  return weight;
}

/** Caption (trimmed with "…" if needed) + blank line + URL, within 280. */
export function composeXText(caption: string, url: string, maxWeight = X_MAX_WEIGHT): string {
  const clean = caption.normalize("NFC").replace(/[ \t]+/g, " ").trim();
  const budget = maxWeight - URL_WEIGHT - 2; // "\n\n"
  if (xWeight(clean) <= budget) return clean ? `${clean}\n\n${url}` : url;

  const ellipsis = "…";
  const room = budget - xWeight(ellipsis);
  let out = "";
  let weight = 0;
  for (const char of clean) {
    const next = charWeight(char.codePointAt(0)!);
    if (weight + next > room) break;
    out += char;
    weight += next;
  }
  return `${out.trimEnd()}${ellipsis}\n\n${url}`;
}
