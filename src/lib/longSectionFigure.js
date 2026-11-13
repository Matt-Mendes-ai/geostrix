// TASKS.csv #3089 — the long-section figure: three stacked panels on one frame and scale ((a) thickness, (b) grade, (c) grade x
// thickness), each a filled, colour-graded contour map at round (or typed) intervals with its contour lines, cut to the drilled extent,
// with a ramp legend and its unit; the along-strike azimuth arrow on the first panel, a scale bar and the method under the last. Drawn on a
// canvas (a PNG, a PDF page, a Layout image), in English like every export. layoutLongSection is pure; drawLongSection needs a 2D context.
import { contourSegments } from "./accumulation.js";
import { bandOf, rampColours } from "./longSection.js";

const niceStep = (span, n) => { const raw = Math.abs(span) / n || 1, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };
const fmtLevel = (v) => { const n = Number(v.toPrecision(3)); return Math.abs(n) >= 1000 ? n.toLocaleString("en-US") : String(n); };

// grid: sectionGrids' result. -> the figure's geometry: width, height, the plot box per panel, metres -> pixels (s along, s * ve up), ve
export function layoutLongSection(grid, { width = 1600, minPlotH = 150, maxPlotH = 480 } = {}) {
  const left = 96, right = 210, titleH = 34, axisH = 40, footH = 74;
  const a0 = grid.x0 - grid.cell / 2, a1 = grid.x0 + (grid.nx - 0.5) * grid.cell, e0 = grid.y0 - grid.cell / 2, e1 = grid.y0 + (grid.ny - 0.5) * grid.cell;
  const spanA = Math.max(1, a1 - a0), spanE = Math.max(1, e1 - e0);
  let plotW = width - left - right, s = plotW / spanA, plotH = spanE * s, ve = 1;
  if (plotH > maxPlotH) { s = maxPlotH / spanE; plotW = spanA * s; plotH = maxPlotH; }
  if (plotH < minPlotH) { ve = minPlotH / plotH; plotH = minPlotH; }
  const panelH = titleH + plotH + axisH;
  const panels = [0, 1, 2].map((k) => ({ x: left, y: k * panelH + titleH, w: plotW, h: plotH }));
  return { width, height: 3 * panelH + footH, panels, s, ve, a0, a1, e0, e1, left, right, titleH, axisH, footY: 3 * panelH };
}

// panels: [{ title, values (Float64Array on the grid), levels, unit }] x 3; points: projectPierces' rows; azimuth: the along-strike azimuth.
export function drawLongSection(ctx, L, grid, panels, { points = [], azimuth = 0, method = "", note = "" } = {}) {
  const X = (a) => L.panels[0].x + (a - L.a0) * L.s;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, L.width, L.height);
  ctx.textBaseline = "middle";
  panels.forEach((pn, k) => {
    const box = L.panels[k], Y = (e) => box.y + box.h - (e - L.e0) * L.s * L.ve;
    const cols = rampColours(pn.levels.length + 1);
    // title
    ctx.fillStyle = "#111827"; ctx.font = "bold 17px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(pn.title, box.x, box.y - L.titleH / 2);
    // the filled bands, pixel by pixel: the grid read bilinearly (so the band edges meet the contour lines, which marching squares draws
    // by the same linear rule), the nearest node where a neighbour is not estimated, white outside the estimate
    const rgb = cols.map((c) => c.match(/\d+/g).map(Number));
    const px0 = Math.round(box.x), py0 = Math.round(box.y), pw = Math.round(box.w), ph = Math.round(box.h), img = ctx.createImageData(pw, ph), D = img.data;
    const V = pn.values, nx = grid.nx, ny = grid.ny;
    for (let py = 0; py < ph; py++) {
      const fj = (L.e0 + (box.h - (py + 0.5)) / (L.s * L.ve) - grid.y0) / grid.cell, j0 = Math.max(0, Math.min(ny - 2, Math.floor(fj))), ty = Math.max(0, Math.min(1, fj - j0));
      for (let px = 0; px < pw; px++) {
        const fi = (L.a0 + (px + 0.5) / L.s - grid.x0) / grid.cell, i0 = Math.max(0, Math.min(nx - 2, Math.floor(fi))), tx = Math.max(0, Math.min(1, fi - i0));
        const k = i0 + nx * j0, a = V[k], b = V[k + 1], c = V[k + nx], d = V[k + nx + 1];
        let v;
        if (a === a && b === b && c === c && d === d) v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
        else v = V[Math.max(0, Math.min(nx - 1, Math.round(fi))) + nx * Math.max(0, Math.min(ny - 1, Math.round(fj)))];
        const q = 4 * (py * pw + px);
        if (v === v && fi > -0.5 && fi < nx - 0.5 && fj > -0.5 && fj < ny - 0.5) { const col = rgb[bandOf(v, pn.levels)]; D[q] = col[0]; D[q + 1] = col[1]; D[q + 2] = col[2]; }
        else { D[q] = 255; D[q + 1] = 255; D[q + 2] = 255; }
        D[q + 3] = 255;
      }
    }
    ctx.putImageData(img, px0, py0);
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    // contour lines at every level
    ctx.strokeStyle = "rgba(17,24,39,0.75)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const lv of pn.levels) for (const sg of contourSegments(grid, pn.values, lv)) { ctx.moveTo(X(sg[0]), Y(sg[1])); ctx.lineTo(X(sg[2]), Y(sg[3])); }
    ctx.stroke();
    // the drilled outline and the pierce points
    if (grid.hull?.length >= 3) { ctx.strokeStyle = "#6b7280"; ctx.setLineDash([5, 4]); ctx.beginPath(); grid.hull.forEach(([a, e], q) => (q ? ctx.lineTo(X(a), Y(e)) : ctx.moveTo(X(a), Y(e)))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); }
    for (const p of points) { ctx.fillStyle = p.thick > 0 ? "#111827" : "#ffffff"; ctx.strokeStyle = "#111827"; ctx.beginPath(); ctx.arc(X(p.along), Y(p.elev), 2.4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = "#111827"; ctx.lineWidth = 1; ctx.strokeRect(box.x, box.y, box.w, box.h);
    // axes: elevation (left), along strike (under each panel)
    ctx.font = "12px sans-serif"; ctx.fillStyle = "#374151";
    const se = niceStep(L.e1 - L.e0, 5);
    ctx.textAlign = "right";
    for (let e = Math.ceil(L.e0 / se) * se; e <= L.e1; e += se) { const y = Y(e); ctx.beginPath(); ctx.moveTo(box.x - 5, y); ctx.lineTo(box.x, y); ctx.stroke(); ctx.fillText(`${fmtLevel(e)}`, box.x - 8, y); }
    ctx.save(); ctx.translate(box.x - 62, box.y + box.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("Elevation (m)", 0, 0); ctx.restore();
    const sa = niceStep(L.a1 - L.a0, 8);
    ctx.textAlign = "center";
    for (let a = Math.ceil(L.a0 / sa) * sa; a <= L.a1; a += sa) { const x = X(a); ctx.beginPath(); ctx.moveTo(x, box.y + box.h); ctx.lineTo(x, box.y + box.h + 5); ctx.stroke(); ctx.fillText(`${fmtLevel(a)}`, x, box.y + box.h + 14); }
    ctx.fillText("Along strike (m)", box.x + box.w / 2, box.y + box.h + 30);
    // the legend ramp: a swatch per band, the level at each boundary, the unit under it
    const lx = box.x + box.w + 30, n = pn.levels.length + 1, sh = Math.min(26, (box.h - 30) / n);
    ctx.textAlign = "left";
    for (let b = 0; b < n; b++) {
      const y = box.y + (n - 1 - b) * sh;
      ctx.fillStyle = cols[b]; ctx.fillRect(lx, y, 26, sh); ctx.strokeStyle = "#9ca3af"; ctx.strokeRect(lx, y, 26, sh);
      if (b > 0) { ctx.fillStyle = "#111827"; ctx.fillText(fmtLevel(pn.levels[b - 1]), lx + 32, y + sh); }
    }
    ctx.fillStyle = "#111827"; ctx.fillText(pn.unit, lx, box.y + n * sh + 16);
    // the along-strike azimuth arrow, on the first panel
    if (k === 0) {
      const ax = box.x + box.w - 70, ay = box.y - L.titleH / 2;
      ctx.strokeStyle = "#111827"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 34, ay); ctx.moveTo(ax + 26, ay - 6); ctx.lineTo(ax + 34, ay); ctx.lineTo(ax + 26, ay + 6); ctx.stroke(); ctx.lineWidth = 1;
      ctx.font = "bold 15px sans-serif"; ctx.textAlign = "left"; ctx.fillText(`${Math.round(azimuth)}°`, ax + 40, ay);
    }
  });
  // the footer: a scale bar, the vertical exaggeration, the method
  const fy = L.footY + 20, bar = niceStep(L.a1 - L.a0, 5), bx = L.panels[0].x, bw = bar * L.s;
  ctx.fillStyle = "#111827"; ctx.fillRect(bx, fy, bw / 2, 6); ctx.strokeStyle = "#111827"; ctx.strokeRect(bx, fy, bw, 6);
  ctx.font = "12px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("0", bx, fy + 18); ctx.textAlign = "right"; ctx.fillText(`${fmtLevel(bar)} m`, bx + bw, fy + 18);
  ctx.textAlign = "left"; ctx.fillStyle = "#374151";
  ctx.fillText(`${L.ve > 1.001 ? `Vertical exaggeration ${L.ve.toFixed(1)}x. ` : "No vertical exaggeration. "}${method}`, bx + bw + 30, fy + 3);
  if (note) ctx.fillText(note, bx + bw + 30, fy + 22);
}
