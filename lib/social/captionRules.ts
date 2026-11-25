// Rules every X caption follows, whoever writes it (the Colab notebook in
// scripts/publish-client/caption_ai.py, or an admin in /admin/review):
// - no banned word: Buffer forbids sexually explicit content, so captions
//   tease; matching ignores case, accents, leetspeak and "f.u.c.k";
// - at most CAPTION_BUDGET by X's weighted count, since the server appends
//   a blank line and the link to the video (see xText.ts).
// BANNED_WORDS must stay equal to the notebook's list (a test checks).

import { X_MAX_WEIGHT, xWeight } from "./xText";

const URL_WEIGHT = 23;
export const CAPTION_BUDGET = X_MAX_WEIGHT - URL_WEIGHT - 2;
/** The caption is the video title (titles vary enough on their own). */
export const DEFAULT_CAPTION_TEMPLATE = "{title}";
/** The default until November 2026; captionUpgrade.ts replaces it where it is unedited. */
export const LEGACY_CAPTION_TEMPLATE = "New video: {title} 🔥";
export const GENERIC_CAPTION = "New video just dropped 🔥";

export const BANNED_WORDS: readonly string[] = [
  "anal", "anus", "bareback", "bdsm", "blowjob", "blow job", "bj", "boner", "bukkake", "butthole",
  "cock", "cocks", "creampie", "cum", "cumming", "cumshot", "deepthroat", "dick", "dicks", "dildo",
  "ejaculate", "ejaculation", "erection", "fap", "fellatio", "fisting", "fuck", "fucked", "fucking",
  "fucks", "gangbang", "handjob", "hardcore", "horny", "jerk off", "jerking", "jizz", "masturbate",
  "masturbating", "milf", "naked", "nude", "nudes", "nudity", "orgasm", "orgy", "penis", "porn",
  "porno", "pornhub", "pussy", "rimjob", "rimming", "semen", "sex", "sexual", "slut",
  "sperm", "suck", "sucking", "testicles", "threesome", "twink", "xxx", "onlyfans", "nsfw",
  "teen", "teens", "underage", "minor", "schoolboy", "barely legal", "young boy", "boy", "boys",
  "lolita", "rape", "forced", "drugged", "incest", "stepbro", "stepdad", "stepson",
  "địt", "đụ", "chịch", "lồn", "cặc", "buồi", "bú cu", "thủ dâm", "khiêu dâm",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

/** Lower case, no accents (đ → d), leetspeak undone. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[013457@$!]/g, (char) => LEET[char] ?? char);
}

/** Folded words; runs of 3+ single letters are joined ("f.u.c.k" → "fuck"). */
function tokens(text: string): string[] {
  const out: string[] = [];
  let run: string[] = [];
  for (const word of [...(fold(text).match(/[a-z]+/g) ?? []), ""]) {
    if (word.length === 1) {
      run.push(word);
      continue;
    }
    if (run.length >= 3) out.push(run.join(""));
    else out.push(...run);
    run = [];
    if (word) out.push(word);
  }
  return out;
}

/** The banned words in text: whole words (plus a plural "s"), so "Sussex" passes. */
export function bannedTerms(text: string, extra: readonly string[] = []): string[] {
  const joined = ` ${tokens(text).join(" ")} `;
  const found: string[] = [];
  for (const term of [...BANNED_WORDS, ...extra.filter((value) => value.trim())]) {
    const folded = (fold(term).match(/[a-z]+/g) ?? []).join(" ");
    if (!folded || found.includes(term)) continue;
    if (joined.includes(` ${folded} `) || (!folded.includes(" ") && joined.includes(` ${folded}s `))) {
      found.push(term);
    }
  }
  return found;
}

function charWeight(char: string): number {
  return xWeight(char);
}

/** Collapses spaces and trims to the budget with "…" at a word boundary. */
export function fitCaption(caption: string, budget = CAPTION_BUDGET): string {
  const clean = caption.normalize("NFC").replace(/[ \t]+/g, " ").trim();
  if (xWeight(clean) <= budget) return clean;
  const room = budget - xWeight("…");
  let out = "";
  let weight = 0;
  for (const char of clean) {
    const next = charWeight(char);
    if (weight + next > room) break;
    out += char;
    weight += next;
  }
  const space = out.lastIndexOf(" ");
  if (space >= 0 && out.length - space <= 25) out = out.slice(0, space);
  return `${out.replace(/[ ,;:-]+$/, "")}…`;
}

export type CaptionCheck = { caption: string; problems: string[] };

/**
 * The caption as it will be posted (fitted to the budget) and what is wrong
 * with it. Problems (banned words, a link, empty) block posting; length is
 * only trimmed.
 */
export function checkCaption(caption: string, extra: readonly string[] = []): CaptionCheck {
  const problems: string[] = [];
  const text = caption.trim();
  if (!text) problems.push("caption trống");
  const banned = bannedTerms(text, extra);
  if (banned.length) problems.push(`có từ cấm: ${banned.join(", ")}`);
  if (/https?:\/\/|www\.|\.(com|fun|net)\b/i.test(text)) problems.push("có link (server tự thêm link bài viết)");
  return { caption: fitCaption(text), problems };
}

/** Video title without accents, as in the notebook's default caption. */
export function asciiTitle(title: string): string {
  return title.replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(/\p{Mn}/gu, "");
}

/** The template (default "{title}") filled in; generic if the result is not postable. */
export function defaultCaption(template: string, title: string, extra: readonly string[] = []): string {
  const filled = (template.trim() || DEFAULT_CAPTION_TEMPLATE).replaceAll("{title}", asciiTitle(title).trim());
  if (/\{[^}]*\}/.test(filled)) return GENERIC_CAPTION;
  const { caption, problems } = checkCaption(filled, extra);
  return problems.length ? GENERIC_CAPTION : caption;
}
