// TASKS.csv #3900 (Matt, 2026-11-20: every size up 2 px as the default, with Normal and Larger) — the text size of the window, a setting on this
// computer (local storage, never a project file). One number carries it: the bump, 0 / 2 / 4 px, that app.css adds to each of the five tokens
// (--text-bump), so Normal is the sizes of before, Large (the default) 12 / 13 / 14 / 16 / 19 and Larger 14 / 15 / 16 / 18 / 21.
// It never reaches figures (theme.js fontSizes keep their sizes), the Layout sheet or an export. Plain module: no React (useTextSize.js is the hook).
export const TEXT_SIZE_KEY = "geostrix.textSize";
export const TEXT_SIZES = [
  { id: "normal", label: "Normal" },
  { id: "large", label: "Large" },
  { id: "larger", label: "Larger" },
];
export const TEXT_BUMP = { normal: 0, large: 2, larger: 4 };
export const DEFAULT_TEXT_SIZE = "large";

const known = (v) => typeof v === "string" && Object.prototype.hasOwnProperty.call(TEXT_BUMP, v);
function stored() {
  try { const v = globalThis.localStorage?.getItem(TEXT_SIZE_KEY); return known(v) ? v : DEFAULT_TEXT_SIZE; } catch { return DEFAULT_TEXT_SIZE; }
}
let current = stored();
const listeners = new Set();

export const textSize = () => current;
export const textBump = () => TEXT_BUMP[current];
// the 3D view's labels on screen: 16 / 19 / 22 px tall (letters about 11.6 / 13.8 / 16 px); a capture keeps 16 (textSprite LABEL_PX)
export const screenLabelPx = () => 16 + 1.5 * textBump();

// sets --text-bump on the page (app.css reads it); called once at start and on every change
export function applyTextSize(doc = globalThis.document) {
  try { doc?.documentElement?.style.setProperty("--text-bump", `${textBump()}px`); } catch { /* no document (tests) */ }
  try { globalThis.window?.desktop?.setTextSize?.(current); } catch { /* the browser build has no native menu */ } // the View menu's radio items follow
}
export function setTextSize(v) {
  if (!known(v) || v === current) return;
  current = v;
  try { globalThis.localStorage?.setItem(TEXT_SIZE_KEY, v); } catch { /* private window: this session only */ }
  applyTextSize();
  listeners.forEach((f) => f());
}
export function subscribeTextSize(f) { listeners.add(f); return () => listeners.delete(f); }
