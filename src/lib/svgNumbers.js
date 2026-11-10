// TASKS.csv #2603 (review #2486, WA lithium) — a section snapshot on a Layout sheet is a frozen SVG: one made before #2515 keeps labels such as
// '2.2915408556696244 % Li' (and hover titles '333.24174602201447–334 m') for good. Their text is still text, so the long numbers in the
// picture's text nodes (never its attributes or geometry) are rounded as #2515 rounds a grade. Nothing else in the picture changes.
import { gradeText } from "./gradeText.js";
import { b64ToBytes, bytesToB64 } from "./base64.js"; // #1114: base64 only through base64.js

const LONG = /-?\d+\.\d{7,}/g; // a stored float printed whole: seven or more decimals

// markup -> { markup, n } with every long number in a text node rounded; n = how many
export function roundLongNumbersInSvg(markup) {
  let n = 0;
  const out = String(markup ?? "").replace(/>([^<]+)</g, (m, text) => {
    const t = text.replace(LONG, (num) => { n++; return gradeText(Number(num)); });
    return `>${t}<`;
  });
  return { markup: out, n };
}

// a snapshot's data URL (base64 SVG, as SectionWindow writes it) -> { src, n }; any other image is left as it is (n = 0)
export function roundLongNumbersInSnapshot(src) {
  const m = /^data:image\/svg\+xml;base64,(.*)$/s.exec(String(src ?? ""));
  if (!m) return { src, n: 0 };
  let markup;
  try { markup = new TextDecoder().decode(b64ToBytes(m[1])); } catch { return { src, n: 0 }; }
  if (!LONG.test(markup)) { LONG.lastIndex = 0; return { src, n: 0 }; }
  LONG.lastIndex = 0;
  const r = roundLongNumbersInSvg(markup);
  return r.n ? { src: `data:image/svg+xml;base64,${bytesToB64(new TextEncoder().encode(r.markup))}`, n: r.n } : { src, n: 0 };
}
