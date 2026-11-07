// TASKS.csv #1484 (review #1352, Silvertip) — every view landed at (90, 90) and every insert at (100, 100), on top of what was already on the
// page: a section snapshot over the plan, its legend exactly over the plan's legend, its scale bar on the plan's bar. A new item now
// takes the free spot on the page that overlaps the least of what is there (top-left first on a tie), inside a margin.
// Pure: no DOM, no React. Boxes in page pixels { x, y, w, h }.

// an element's box; a text, legend or bar that stores no height gets the size it usually draws at
const DEFAULT_SIZE = { text: [200, 40], legend: [220, 300], north: [60, 80], scale: [260, 50], logo: [160, 80], table: [320, 200] };
export function elementBox(el) {
  const d = DEFAULT_SIZE[el?.type] || [200, 100];
  const w = Number(el?.w) > 0 ? Number(el.w) : d[0];
  const h = Number(el?.h) > 0 ? Number(el.h) : el?.aspect > 0 ? w / el.aspect : d[1];
  return { x: Number(el?.x) || 0, y: Number(el?.y) || 0, w, h };
}

const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// the top-left corner for a w x h item on a page { w, h } holding `elements`
export function freeSpot(elements, w, h, page = { w: 1123, h: 794 }, { margin = 40, step = 20 } = {}) {
  const boxes = (elements || []).map(elementBox);
  const xMax = Math.max(margin, page.w - margin - w), yMax = Math.max(margin, page.h - margin - h);
  let best = null;
  for (let y = margin; y <= yMax; y += step) {
    for (let x = margin; x <= xMax; x += step) {
      const c = { x, y, w, h };
      let o = 0;
      for (const b of boxes) { o += overlap(c, b); if (best && o >= best.o) break; }
      if (!best || o < best.o) { best = { x, y, o }; if (o === 0) return { x, y }; }
    }
  }
  return best ? { x: best.x, y: best.y } : { x: margin, y: margin };
}
