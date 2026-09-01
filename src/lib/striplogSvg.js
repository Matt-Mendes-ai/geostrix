// TASKS.csv #130 — Atlas (one Layout page per drillhole, QGIS-style batch report generation). Each
// generated hole page can embed a strip-log image, which needs to exist as a plain PNG data URL (the
// same shape every other Layout `image` element already uses) rather than a live mounted component —
// there's no way to "screenshot" React output for N holes in a batch pass without actually mounting
// and unmounting N off-screen StripLog instances, which is slow and fragile compared to just building
// the same kind of SVG directly as a string and rasterizing it once per hole.
//
// Deliberately a SEPARATE, smaller implementation from components/StripLog.jsx's interactive modal,
// not a shared extraction — StripLog.jsx is working, already-shipped code with its own JSX-based
// rendering (assay track, zoom slider, element picker); reusing it here would mean either mounting it
// off-screen per hole (slow, and it renders straight to the DOM) or refactoring its JSX into a second
// string-building code path, which risks the same "silent behavior change" the #238 design-system
// pass explicitly avoided when it found real per-file variance not worth force-unifying. This covers
// litho/alteration/vein/geotech — the always-available columns — and skips the assay track (which
// StripLog's interactive version needs a user-picked element for anyway, not meaningful to default
// per-hole in an unattended batch run).
import { LAYER_META, UNIT_NAMES, colorForAlteration, colorForVein, rqdColor } from "./layers.js";

const TRACK_W = 90;
const DEPTH_COL_W = 50;
const PAD_TOP = 36;
const PAD_BOTTOM = 20;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function fillTrack(rows, x, sy, colorFn, nameFn) {
  return rows.map((r) => {
    const y0 = sy(r.from), y1 = sy(r.to);
    const h = Math.max(1, y1 - y0);
    const color = colorFn ? colorFn(r.value) : "#8a94a3";
    const label = nameFn ? nameFn(r.value) : r.value;
    return `<rect x="${x}" y="${y0}" width="${TRACK_W - 6}" height="${h}" fill="${color}" stroke="#ffffff" stroke-width="0.5"><title>${esc(label)} (${r.from}-${r.to} m)</title></rect>`
      + (h > 11 ? `<text x="${x + 4}" y="${y0 + h / 2 + 3}" font-size="8" fill="#1a2028">${esc(String(label)).slice(0, 14)}</text>` : "");
  }).join("");
}
function tickTrack(rows, x, sy, colorFn) {
  return rows.map((r) => {
    const y = sy((r.from + r.to) / 2);
    const color = colorFn ? colorFn(r.value) : "#8a94a3";
    return `<line x1="${x}" y1="${y}" x2="${x + TRACK_W - 6}" y2="${y}" stroke="${color}" stroke-width="2.5"><title>${esc(r.value)} (${r.from}-${r.to} m)</title></line>`;
  }).join("");
}
function barTrack(rows, x, sy, max) {
  return rows.map((r) => {
    const y0 = sy(r.from), y1 = sy(r.to);
    const h = Math.max(1, y1 - y0);
    const v = Number(r.value);
    const w = Number.isFinite(v) ? Math.max(0, Math.min(1, v / max)) * (TRACK_W - 10) : 0;
    return `<rect x="${x}" y="${y0}" width="${w}" height="${h}" fill="${rqdColor(v)}"><title>${Number.isFinite(v) ? v.toFixed(0) : "?"} (${r.from}-${r.to} m)</title></rect>`;
  }).join("");
}

// Builds the strip-log SVG markup (a string, not a DOM element) for one hole. Returns null if the hole
// has no collar or no depth to show — same "nothing to draw" case StripLog.jsx's own maxDepth guard
// handles, just returned instead of rendered as an empty page.
export function buildStripLogSvgMarkup({ holeId, collars, layers }) {
  const collar = collars.find((c) => c.hole_id === holeId);
  const litho = (layers.litho || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from);
  const alt = (layers.alt || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from);
  const vein = (layers.vein || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from);
  const geotech = (layers.geotech || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from);
  const maxDepth = Math.max(collar?.length || 0, ...litho.map((r) => r.to), ...alt.map((r) => r.to), ...vein.map((r) => r.to), ...geotech.map((r) => r.to), 0);
  if (maxDepth <= 0) return null;

  const pxPerMeter = Math.max(1, Math.min(8, 900 / maxDepth));
  const sy = (d) => PAD_TOP + d * pxPerMeter;
  const H = sy(maxDepth) + PAD_BOTTOM;
  const tracks = [
    { label: "Litho", rows: litho, kind: "fill", colorFn: LAYER_META.litho.colorFn, nameFn: (v) => UNIT_NAMES[v] || v },
    { label: "Alt.", rows: alt, kind: "fill", colorFn: colorForAlteration },
    { label: "Vein", rows: vein, kind: "tick", colorFn: colorForVein },
    { label: "RQD%", rows: geotech, kind: "bar", max: 100 },
  ].filter((t) => t.rows.length);
  if (!tracks.length) return null;
  const W = DEPTH_COL_W + tracks.length * TRACK_W + 10;

  let body = "";
  // Depth gridlines/labels every ~10 rendered pixels' worth of meters, same idea StripLog uses.
  const depthStep = Math.max(5, Math.ceil(maxDepth / 20 / 5) * 5);
  for (let d = 0; d <= maxDepth; d += depthStep) {
    const y = sy(d);
    body += `<line x1="${DEPTH_COL_W}" y1="${y}" x2="${W - 6}" y2="${y}" stroke="#e6e8eb" stroke-width="1"/>`;
    body += `<text x="4" y="${y + 3}" font-size="9" fill="#5a6472">${d}</text>`;
  }
  let x = DEPTH_COL_W;
  tracks.forEach((t) => {
    body += `<text x="${x + 2}" y="16" font-size="10" font-weight="600" fill="#1a2028">${esc(t.label)}</text>`;
    body += `<rect x="${x}" y="${PAD_TOP - 2}" width="${TRACK_W - 6}" height="${sy(maxDepth) - PAD_TOP + 2}" fill="none" stroke="#c7ccd3" stroke-width="1"/>`;
    if (t.kind === "fill") body += fillTrack(t.rows, x, sy, t.colorFn, t.nameFn);
    else if (t.kind === "tick") body += tickTrack(t.rows, x, sy, t.colorFn);
    else if (t.kind === "bar") body += barTrack(t.rows, x, sy, t.max);
    x += TRACK_W;
  });

  const title = `${esc(holeId)}${collar ? ` — ${maxDepth.toFixed(0)} m` : ""}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + 20}" width="${W}" height="${H + 20}">`
    + `<rect x="0" y="0" width="${W}" height="${H + 20}" fill="#ffffff"/>`
    + `<text x="4" y="20" font-size="12" font-weight="700" fill="#1a2028">${title}</text>`
    + `<g transform="translate(0,20)">${body}</g>`
    + `</svg>`;
  return { svg, width: W, height: H + 20 };
}

// Rasterizes buildStripLogSvgMarkup's output into a PNG data URL, the same SVG->canvas->PNG technique
// StripLog.jsx's own exportPNG button already uses. Returns null if the hole had nothing to draw.
export async function buildStripLogDataUrl({ holeId, collars, layers }) {
  const built = buildStripLogSvgMarkup({ holeId, collars, layers });
  if (!built) return null;
  const { svg, width, height } = built;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Couldn't rasterize the strip log for "${holeId}".`));
      el.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale; canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), aspect: width / height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
