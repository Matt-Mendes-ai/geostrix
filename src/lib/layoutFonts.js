// TASKS.csv #2144 (review #2013, Woodjam) — the Layout's typefaces: the app's figure font (Exo 2, bundled) first, then the fonts every
// Windows / macOS machine has, the list the section window's Text menu offers (#1129). A report figure usually needs the report's font.
// Stored on each text-bearing element as its label (el.fontFamily = "Arial"); no value is Exo 2. A system font is drawn and printed with
// what the computer has (the PDF embeds it); Exo 2 is the bundled one. Pure.
export const LAYOUT_DEFAULT_FONT = "Exo 2";
export const LAYOUT_FONTS = [
  { label: "Exo 2", stack: "'Exo 2', system-ui, sans-serif" },
  { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", stack: "Calibri, Carlito, sans-serif" },
  { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { label: "Times New Roman", stack: "'Times New Roman', Times, serif" },
  { label: "Courier New", stack: "'Courier New', Courier, monospace" },
];
// the element types that draw text, and so take a typeface
export const LAYOUT_FONT_TYPES = new Set(["title", "text", "legend", "table", "titleblock", "scale", "north", "drillplan", "callout"]);

// a stored label -> its CSS font stack (unknown or none: Exo 2)
export function layoutFontStack(label) {
  return (LAYOUT_FONTS.find((f) => f.label === label) || LAYOUT_FONTS[0]).stack;
}
// the page's typeface: the one most of its text-bearing elements use (a tie: the first met), or null on a page with none of them
export function pageFont(elements) {
  const n = new Map();
  for (const e of elements || []) if (LAYOUT_FONT_TYPES.has(e?.type)) { const f = LAYOUT_FONTS.some((x) => x.label === e.fontFamily) ? e.fontFamily : LAYOUT_DEFAULT_FONT; n.set(f, (n.get(f) || 0) + 1); }
  let best = null, k = 0;
  n.forEach((c, f) => { if (c > k) { best = f; k = c; } });
  return best;
}
// every text-bearing element of a page set to `label` (Exo 2 clears the field). -> a new array
export function withPageFont(elements, label) {
  const v = label && label !== LAYOUT_DEFAULT_FONT ? label : undefined;
  return (elements || []).map((e) => {
    if (!LAYOUT_FONT_TYPES.has(e?.type)) return e;
    const { fontFamily: _f, ...rest } = e;
    return v ? { ...rest, fontFamily: v } : rest;
  });
}
