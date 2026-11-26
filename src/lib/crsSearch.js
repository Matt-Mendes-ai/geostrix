// TASKS.csv #1469 (review #1352, Silvertip) — the CRS picker listed NAD83(CSRS) zones, BC Albers and SIRGAS before the project's own
// NAD83 / UTM zone 9N (26909), and 'UTM zone 9N' ranked the 19N zones first: '9n' is a substring of '19n'. Every word typed must still
// appear somewhere (as before); the hits are then ordered: an exact code, every word matching a whole word of the name (9N, not 19N),
// the pinned codes (the project's CRS, the current choice), then the rest in the list's own order.
// list: [{ code, name }]; pinned: codes to put first (nulls ignored) -> a new array
export function rankCrs(list, query, pinned = []) {
  const pins = [...new Set((pinned || []).map(Number).filter((c) => Number.isFinite(c) && c > 0))];
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    const byCode = new Map(list.map((c) => [c.code, c]));
    const first = pins.map((c) => byCode.get(c)).filter(Boolean);
    return [...first, ...list.filter((c) => !pins.includes(c.code))];
  }
  const scored = [];
  list.forEach((c, i) => {
    const hay = `${c.name} epsg:${c.code} ${c.code}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return;
    const tokens = new Set(hay.split(/[^a-z0-9.]+/).filter(Boolean));
    const exactCode = words.length === 1 && String(c.code) === words[0];
    const whole = words.every((w) => tokens.has(w.replace(/^epsg:/, "")) || tokens.has(w));
    const score = (exactCode ? 4 : 0) + (whole ? 2 : 0) + (pins.includes(c.code) ? 1 : 0);
    scored.push({ c, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.c);
}

// TASKS.csv #4100 (#4070's closing audit) — the Project CRS and 'A layer' choosers opened on a 60-row list ("60 of 5,811 shown"), ~400 words
// before a choice. The pinned codes GeoStrix can build (the current CRS, the choice, the zones at the collars) come first, at most `max`; the full
// list is one click away. Empty when none of them is known: the chooser then opens on the full list, as before.
export function crsShortList(list, pinned = [], max = 5) {
  const byCode = new Map((list || []).map((c) => [c.code, c])), out = [];
  for (const p of pinned || []) {
    const c = byCode.get(Number(p));
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}
