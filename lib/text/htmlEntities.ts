// Titles imported from the old WordPress site (and some host file names)
// arrive HTML-escaped: "Tiến &#40;anh điện lạnh&#41;", "Ruby &amp; Co",
// sometimes twice ("&amp;#40;"). Decode them to plain text before storing.

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  times: "×",
  copy: "©",
  reg: "®",
  trade: "™",
};

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,8}));/g;

function decodeOnce(value: string): string {
  return value.replace(ENTITY, (match, dec?: string, hex?: string, name?: string) => {
    if (name) return NAMED[name.toLowerCase()] ?? match;
    const code = dec ? Number(dec) : parseInt(hex ?? "", 16);
    // Leave invalid code points (and NUL) as they were.
    if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match;
    return String.fromCodePoint(code);
  });
}

/** Decode HTML entities, including double-escaped ones like "&amp;#40;". */
export function decodeHtmlEntities(value: string): string {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** A display title: entities decoded, whitespace (incl. nbsp) collapsed. */
export function cleanTitle(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

export function hasHtmlEntity(value: string): boolean {
  return new RegExp(ENTITY.source).test(value);
}
