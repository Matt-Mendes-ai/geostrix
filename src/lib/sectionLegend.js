// TASKS.csv #1043 (review #1016, software artist) — the cross-section window's key, drawn inside its <svg> so the
// window, SVG, PNG and PDF exports all carry it (before, the section went out as coloured ribbons with no key). Pure
// layout: items in columns under the distance axis, capped, with "+ n more" for the rest.
export const SECTION_LEGEND_MAX = 20;
const COLS = 4, ROW_H = 15, HEAD_H = 18, TAIL_PAD = 10, MORE_H = 14, MAX_CHARS = 34;

const clip = (s) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);

// items: [[label, color, opt?]] (buildSectionPayload's legendItems) -> { entries: [{ x, y, label, full, color, kind }],
// more, height } in SVG units, relative to the legend's top-left; height 0 when there is nothing to show
export function sectionLegendLayout(items, width, max = SECTION_LEGEND_MAX) {
  const all = (items || []).filter((it) => it && it[0] != null);
  if (!all.length) return { entries: [], more: 0, height: 0 };
  const shown = all.slice(0, max);
  const colW = width / COLS, rows = Math.ceil(shown.length / COLS);
  // column-major, so an alphabetical list reads down each column
  const entries = shown.map(([label, color, opt], i) => ({ x: Math.floor(i / rows) * colW, y: HEAD_H + (i % rows) * ROW_H, label: clip(String(label)), full: String(label), color, kind: opt?.kind }));
  const more = all.length - shown.length;
  return { entries, more, height: HEAD_H + rows * ROW_H + (more ? MORE_H : 0) + TAIL_PAD };
}
