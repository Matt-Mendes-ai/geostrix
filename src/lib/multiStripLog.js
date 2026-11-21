// TASKS.csv #3560 A1 (Matt: "A0 now, then A1") — several holes' strip logs side by side on ONE depth scale, composed from lib/striplogSvg.js
// buildStripLogSvgMarkup (so every track, legend edit and print rule of the single log applies). align: "depth" (every hole from its own 0 m: the
// usual strip-log comparison) or "rl" (each hung from its collar elevation, so the same height lines up across holes, for correlation).
import { buildStripLogSvgMarkup, PAD_TOP, PAD_BOTTOM } from "./striplogSvg.js"; // the paddings: #3900 (the bottom one grew for 10 px captions)
import { arrMax } from "./arrayStats.js"; // #371 — no spread
import { t as tr } from "./i18n.js"; // TASKS.csv #3764

export const MULTI_MAX_HOLES = 8; // beyond this a column is too narrow to read on a page
const GAP = 10;

// opts: buildStripLogSvgMarkup's, minus holeId; holeIds: the holes in order; pxPerMeter: the shared scale (null: the longest hole's own, <= 8)
// -> { svg, width, height, pxPerMeter, holes: [{ holeId, x, y, width, height }], skipped: [holeId] } or null when no hole has anything to draw
export function composeStripLogs(holeIds, opts, { align = "depth", pxPerMeter = null } = {}) {
  const ids = (holeIds || []).slice(0, MULTI_MAX_HOLES);
  // the longest hole sets the scale when none is given, as the single log does for its own hole
  let px = pxPerMeter, tickStep = null;
  {
    let longest = 0;
    for (const id of ids) { const b = buildStripLogSvgMarkup({ ...opts, holeId: id, pxPerMeter: 1 }); if (b) longest = Math.max(longest, (b.height - 20 - PAD_TOP - PAD_BOTTOM) / b.pxPerMeter); }
    if (!(px > 0)) px = longest > 0 ? Math.max(1, Math.min(8, 900 / longest)) : 1;
    // TASKS.csv #3764 — one depth tick step for every column (the first column read every 15 m, the others every 10: each took its own hole's length)
    tickStep = Math.max(5, Math.ceil(longest / 20 / 5) * 5);
  }
  const built = [], skipped = [];
  for (const id of ids) { const b = buildStripLogSvgMarkup({ ...opts, holeId: id, pxPerMeter: px, depthStep: tickStep }); if (b) built.push({ id, b }); else skipped.push(id); }
  if (!built.length) return null;
  const zOf = (id) => { const c = (opts.collars || []).find((q) => q.hole_id === id); return Number.isFinite(c?.z) ? c.z : null; };
  const zTop = align === "rl" ? arrMax(built.map(({ id }) => zOf(id) ?? -Infinity)) : null;
  let x = 0, height = 0;
  const holes = built.map(({ id, b }) => {
    const dy = align === "rl" && Number.isFinite(zTop) && zOf(id) != null ? Math.round((zTop - zOf(id)) * px) : 0;
    const h = { holeId: id, x, y: dy, width: b.width, height: b.height, markup: b.svg };
    x += b.width + GAP; height = Math.max(height, dy + b.height);
    return h;
  });
  // TASKS.csv #3764 — hung by collar elevation the scale is still the DOWNHOLE depth: the same line across the page is the same level only in vertical holes
  const note = align === "rl" && holes.length > 1 ? tr("Hung by collar elevation: the scale is downhole depth, so the same line across is the same level only in vertical holes.") : "";
  if (note) height += 18; // #3900: the note at 10 px (was 9)
  const width = Math.max(1, x - GAP, note ? Math.min(900, note.length * 5.8) : 0);
  const inner = holes.map((h) => h.markup.replace("<svg ", `<svg x="${h.x}" y="${h.y}" `)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>${inner}${note ? `<text x="4" y="${height - 5}" font-size="10" fill="#5a6472">${note.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>` : ""}</svg>`;
  return { svg, width, height, pxPerMeter: px, note, holes: holes.map(({ markup: _m, ...r }) => r), skipped };
}
