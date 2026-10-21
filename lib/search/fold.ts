import { Prisma } from "@prisma/client";

// Accent-insensitive search: "tran" finds "Trần", "duc" finds "Đức".
// The same folding runs in JS (for the query and in-memory lists) and in SQL
// (for stored titles, categories and tags), so both sides always agree.

/** Lower-case, strip diacritics, and map đ/Đ (not a diacritic in Unicode) to d. */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

// Postgres has no accent folding without the unaccent extension, so build a
// translate() map instead: every precomposed Latin letter (Latin-1, Extended
// A/B, and Latin Extended Additional, which holds Vietnamese ạ ầ ế ộ ự…) that
// folds to a single ASCII letter.
function buildTranslateMap() {
  let from = "";
  let to = "";
  const ranges: [number, number][] = [
    [0x00c0, 0x024f],
    [0x1e00, 0x1eff],
  ];
  for (const [start, end] of ranges) {
    for (let code = start; code <= end; code += 1) {
      const char = String.fromCharCode(code);
      const folded = foldText(char);
      if (folded !== char && /^[a-z]$/.test(folded)) {
        from += char;
        to += folded;
      }
    }
  }
  return { from, to };
}

export const FOLD_TRANSLATE = buildTranslateMap();

/** SQL for foldText(expression): NFC first so decomposed input maps too. */
export function foldSql(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`lower(translate(normalize(${expression}, NFC), ${FOLD_TRANSLATE.from}, ${FOLD_TRANSLATE.to}))`;
}

/** Escape a folded query for use inside a POSIX regular expression. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
