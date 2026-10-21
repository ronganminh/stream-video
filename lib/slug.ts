import { foldText } from "./search/fold";
import { normalize } from "./sync/normalize";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * URL slug for a title or name: "Bevis Trần Đức Vương" -> "bevis-tran-duc-vuong".
 * Uses the search folding (diacritics stripped, đ/Đ -> d), so a slug always
 * matches what an accent-free search for the title would type.
 */
export function slugify(value: string, maxLength = 240): string {
  return foldText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, "");
}

/**
 * The rule used before đ was handled: NFD + strip combining marks, which
 * leaves đ/Đ (not a combining mark) to be dropped ("Đức" -> "uc"). Kept to
 * find existing tags and to report old video slugs; never used for new ones.
 */
export function legacySlugify(value: string): string {
  return normalize(value).replace(/\s+/g, "-");
}

/** Admin input: what they typed, slugified; or derived from the fallback when empty. */
export function slugFromInput(input: unknown, fallback: string, maxLength = 240): string {
  const typed = typeof input === "string" ? input.trim() : "";
  return slugify(typed || fallback, maxLength);
}
