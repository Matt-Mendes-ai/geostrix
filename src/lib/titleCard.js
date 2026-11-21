// TASKS.csv #3940 (second part) — a button that has only a native title="…" gets the same styled info card as a ribbon tool.
// The card's heading is the button's own name when that is a real word and not just the title again (an aria-label, else its
// visible text, as for "Fit" or "Figure"); an icon or glyph button (×, ▲, +, an SVG) shows the title alone. Pure, so
// test/toolInfoCard3940.test.mjs can check the rule.
export function titleCardParts({ title, ariaLabel, text }) {
  const body = String(title ?? "").trim();
  const same = (a) => String(a).trim().toLowerCase() === body.toLowerCase();
  const name = String(ariaLabel ?? "").trim();
  const shown = String(text ?? "").replace(/\s+/g, " ").trim();
  let heading = "";
  if (name && !same(name)) heading = name;
  else if (!name && /\p{L}{2,}/u.test(shown) && shown.length <= 30 && !same(shown)) heading = shown;
  return { heading, body };
}
