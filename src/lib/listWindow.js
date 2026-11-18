// TASKS.csv #3893 (Matt, 2026-11-17: the Holes list "give it a scroll bar within it"; the plan's window accepted) — which rows of a long list of
// fixed-height rows to draw in a scroll box: the rows in view plus `overscan` on each side, and the empty space above and below that keeps
// the scroll bar the size of the whole list. A page of 10,000 holes then holds about 35 rows, wherever the box is scrolled. Pure.
// scrollTop, boxHeight, rowHeight in px; count rows -> { start, end (exclusive), padTop, padBottom } (px)
export function windowRange(scrollTop, rowHeight, boxHeight, count, overscan = 10) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n || !(rowHeight > 0)) return { start: 0, end: n, padTop: 0, padBottom: 0 };
  const top = Math.max(0, Number(scrollTop) || 0), box = Math.max(0, Number(boxHeight) || 0), over = Math.max(0, Math.floor(overscan));
  const first = Math.min(n - 1, Math.floor(top / rowHeight)), inView = Math.ceil(box / rowHeight) + 1;
  const start = Math.max(0, first - over), end = Math.min(n, first + inView + over);
  return { start, end, padTop: start * rowHeight, padBottom: (n - end) * rowHeight };
}
