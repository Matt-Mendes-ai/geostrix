// TASKS.csv #2134 (review #2013, Layout) — a long legend flowed into up to 4 columns (#1480 / #1637) whatever the room to its right: an
// 81-row legend at 1:50,000 ran past the sheet's right edge and over the title block. The column count is now held to the room right of
// the legend, and rows that still do not fit are left out with a note saying how many (the sheet is a printed page: nothing past it shows).
// Pure: rowH(item) gives a row's printed height in page px, labelW(item) its label's width.
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
