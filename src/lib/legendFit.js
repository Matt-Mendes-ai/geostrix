// TASKS.csv #2134 (review #2013, Layout) — a long legend flowed into up to 4 columns (#1480 / #1637) whatever the room to its right: an
// 81-row legend at 1:50,000 ran past the sheet's right edge and over the title block. The column count is now held to the room right of
// the legend, and rows that still do not fit are left out with a note saying how many (the sheet is a printed page: nothing past it shows).
// Pure: rowH(item) gives a row's printed height in page px, labelW(item) its label's width.
import { printPt, printPx } from "./theme.js"; // TASKS.csv #2869

// TASKS.csv #2869 (GSC review B21) — the printed row heights and label widths of a Layout legend (moved from LayoutModule's legend element,
// which still uses them), so a new legend can be placed at the size it draws at. #2747's picture colour bar is up to 120 px tall.
export function legendRowH(it) {
  const o = it?.[2];
  return o?.heading ? printPx(printPt.small) + 8 : o?.note ? printPx(printPt.caption) + 4 : o?.ramp ? 44 : o?.image ? 140 : Math.max(17, printPx(printPt.small) + 5);
}
export function legendLabelW(it) {
  const o = it?.[2];
  const len = String(it?.[0] ?? "").length;
  // a ramp's or a colour bar's name is a bold line above it, and a legend does not wrap it: the wider of the two
  if (o?.ramp || o?.image) return Math.max(o.ramp ? 152 : 160, len * printPx(printPt.small) * 0.6);
  return o?.heading ? len * printPx(printPt.small) * 0.6 : o?.note ? Math.min(200, len * printPx(printPt.caption) * 0.55) : len * printPx(printPt.small) * 0.55;
}
// The box a one-column legend of `items` draws: 12 px padding a side, a 150 px minimum, the swatch column (28 px) before a row's label, and
// the 'Legend' title. A new legend stored no width, so it was placed as 220 px wide and then grew over what was beside it (the north arrow:
// an IDW grid's 50-character name). -> { w, h }
export function legendBoxSize(items) {
  const list = items || [];
  const content = Math.max(126, ...list.map((it) => (it?.[2]?.heading || it?.[2]?.ramp || it?.[2]?.image || it?.[2]?.note ? 0 : 28) + legendLabelW(it)));
  return { w: Math.ceil(content + 26), h: Math.ceil(16 + printPx(printPt.body) * 1.25 + 6 + list.reduce((a, it) => a + legendRowH(it), 0)) };
}
export function legendFit(items, { x = 0, y = 0, pageW = 1123, pageH = 794, margin = 30, rowH, labelW, maxCols = 4, gap = 18, pad = 24, head = 40 } = {}) {
  const list = items || [];
  const heights = list.map(rowH);
  const total = head + heights.reduce((a, b) => a + b, 0);
  const room = pageH - y - margin;
  if (room <= 80) return { cols: 1, shown: list.length, left: 0 };
  const colW = Math.max(150, ...list.map((it) => 28 + labelW(it)));
  const across = Math.max(1, Math.floor((pageW - x - margin - pad + gap) / (colW + gap)));
  const want = Math.min(maxCols, Math.max(1, Math.ceil(total / room)));
  const cols = Math.min(want, across);
  const cap = cols * (room - head);
  let used = 0, shown = 0;
  for (; shown < list.length; shown++) { if (used + heights[shown] > cap) break; used += heights[shown]; }
  if (shown === list.length) return { cols, shown, left: 0 };
  // room for the note row: drop rows until it fits (and never end on a group heading)
  const noteH = 16;
  while (shown > 0 && used + noteH > cap) { shown--; used -= heights[shown]; }
  while (shown > 0 && list[shown - 1]?.[2]?.heading) { shown--; }
  return { cols, shown, left: list.length - shown };
}
