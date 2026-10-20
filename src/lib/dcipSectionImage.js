// TASKS.csv #322 — the inverted DC/IP section as a PNG (for a file, or a Layout page): the cells at true
// distance / elevation with a vertical exaggeration chosen to fit the frame (stated on the image), poorly
// supported cells grey, electrodes, axes, a colour bar and the fit. Drawn on a canvas rather than
// rasterising the panel's SVG, so it has the resolution and the labels a figure needs.
import { colors, printPt, printPx } from "./theme.js";
// Layout places an imported image at up to 700 page px wide (LayoutModule addImportedImages)
const PLACED_W = 700;
import { colorForVoxelValue } from "./layers.js";
import { logStops, sequentialStops, fitVerdict } from "./inversion.js";
import { arrMin, arrMax } from "./arrayStats.js";
import { canvasHatch, HATCH } from "./supportHatch.js"; // TASKS.csv #535
import { supportEnvelope } from "./supportEnvelope.js"; // TASKS.csv #641
import { columnReach, smoothReachLine } from "./dcip.js"; // TASKS.csv #772

// 1, 2, 5 x 10^n step giving about `n` ticks over [lo, hi]
export function niceStep(lo, hi, n = 6) {
  const raw = Math.abs(hi - lo) / n || 1, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

export function renderDcipSectionPng({ result, name, field = "resistivity", cutoff = 0, width = 1600 }) {
  const c = result.cells, vals = c[field];
  const s0 = arrMin(c.s.map((s, i) => s - c.ds[i] / 2)), s1 = arrMax(c.s.map((s, i) => s + c.ds[i] / 2));
  const z0 = arrMin(c.z.map((z, i) => z - c.dz[i] / 2)), z1 = arrMax(c.z.map((z, i) => z + c.dz[i] / 2));
  const isRho = field === "resistivity";
  const model = { stops: isRho ? logStops(arrMin(vals), arrMax(vals)) : sequentialStops(0, arrMax(vals)), colorMode: "continuous" };
  // TASKS.csv #585 — text sized for where the image is used: Layout places an image at up to PLACED_W page px, so a
  // 1600 px PNG prints at ~0.44x and its 14 px labels came out at 4.6 pt. Each size is a print-scale point size
  // (theme printPt) at that placement; the margins grow with them.
  const k = width / PLACED_W;
  const fpx = (pt) => printPx(pt) * k;
  const L = Math.round(fpx(printPt.small) * 5.6), R = 40, T = Math.round(fpx(printPt.label) * 2.8), B = Math.round(fpx(printPt.small) * 9);
  const plotW = width - L - R;
  const sx = plotW / (s1 - s0);
  // vertical exaggeration: true scale unless the section would be thinner than ~22% of the width; capped at 5x
  const ve = Math.min(5, Math.max(1, (0.22 * plotW) / ((z1 - z0) * sx)));
  const sz = sx * ve, plotH = Math.round((z1 - z0) * sz);
  const height = T + plotH + B;
  const cv = document.createElement("canvas");
  cv.width = width; cv.height = height;
  const g = cv.getContext("2d");
  const font = (px, w = 400) => `${w} ${px}px 'Exo 2', system-ui, sans-serif`;
  g.fillStyle = colors.bg; g.fillRect(0, 0, width, height);
  const X = (s) => L + (s - s0) * sx, Y = (z) => T + (z1 - z) * sz;
  // cells (a hair of overlap hides anti-aliasing seams between neighbours)
  const env = supportEnvelope(c.s, c.z, c.support);
  const hatch = canvasHatch(g, 8); // #535 — low support hatched, never a ramp-like flat grey
  for (let i = 0; i < vals.length; i++) {
    g.fillStyle = env[i] < cutoff ? hatch : colorForVoxelValue(model, vals[i]);
    g.fillRect(X(c.s[i] - c.ds[i] / 2), Y(c.z[i] + c.dz[i] / 2), c.ds[i] * sx + 0.6, c.dz[i] * sz + 0.6);
  }
  // TASKS.csv #772 — the DOI index line, dashed, when the run computed it
  const doiT = result.doiMethod?.threshold ?? 0.2;
  const doiOk = c.doi && !(result.doiMethod?.misfitOfEachRun || []).some((v) => !(v <= 1.5)); // as the panel: no line from a failed run
  if (doiOk) {
    const pts = smoothReachLine(columnReach(c, (i) => c.doi[i] <= doiT).cols);
    g.save(); g.strokeStyle = colors.text; g.lineWidth = 2; g.setLineDash([10, 7]); g.beginPath();
    pts.forEach((o, k) => (k ? g.lineTo(X(o.s), Y(o.z)) : g.moveTo(X(o.s), Y(o.z))));
    g.stroke(); g.restore();
  }
  g.fillStyle = colors.text;
  for (const e of result.electrodes) { g.beginPath(); g.arc(X(e[0]), Y(e[1]), 3, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = colors.textSecondary; g.lineWidth = 1; g.strokeRect(L, T, plotW, plotH);
  // axes
  g.font = font(fpx(printPt.small)); g.fillStyle = colors.textSecondary; g.textAlign = "center"; g.textBaseline = "top";
  const ds = niceStep(s0, s1, 10);
  for (let s = Math.ceil(s0 / ds) * ds; s <= s1 + 1e-9; s += ds) {
    g.beginPath(); g.moveTo(X(s), T + plotH); g.lineTo(X(s), T + plotH + 6); g.stroke();
    g.fillText(String(+s.toFixed(6)), X(s), T + plotH + 9);
  }
  g.fillText("Distance along the line (m)", L + plotW / 2, T + plotH + 12 + fpx(printPt.small) * 1.4);
  g.textAlign = "right"; g.textBaseline = "middle";
  const dz = niceStep(z0, z1, Math.max(3, Math.round(plotH / 70)));
  for (let z = Math.ceil(z0 / dz) * dz; z <= z1 + 1e-9; z += dz) {
    g.beginPath(); g.moveTo(L - 6, Y(z)); g.lineTo(L, Y(z)); g.stroke();
    g.fillText(String(+z.toFixed(6)), L - 9, Y(z));
  }
  g.save(); g.translate(fpx(printPt.small) * 0.9, T + plotH / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("Elevation (m)", 0, 0); g.restore();
  // title + fit
  g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = colors.text; g.font = font(fpx(printPt.label), 600);
  g.fillText(`${isRho ? "Resistivity" : "Chargeability"} — DC/IP line ${name}`, L, fpx(printPt.label) * 1.15);
  g.font = font(fpx(printPt.caption)); g.fillStyle = colors.textSecondary;
  const chi = isRho ? fitVerdict(result).chi : result.ip ? result.ip.phi_d / result.target : NaN;
  g.fillText(`2.5D SimPEG inversion · misfit ${Number.isFinite(chi) ? chi.toFixed(2) : "?"}× the target · vertical exaggeration ${ve.toFixed(1)}× · hatched = below the depth the data see (no cell at or beneath it reaches support ${cutoff})${doiOk ? ` · dashed = DOI index ${doiT} (Oldenburg & Li, median over 5 columns)` : ""}`, L, fpx(printPt.label) * 1.15 + fpx(printPt.caption) * 1.5);
  // colour bar
  const by = T + plotH + 16 + fpx(printPt.small) * 3, bw = Math.min(Math.round(width * 0.325), plotW), bh = Math.round(fpx(printPt.caption) * 0.8);
  const lo = isRho ? arrMin(vals) : 0, hi = arrMax(vals);
  for (let k = 0; k < bw; k++) {
    const t = k / (bw - 1);
    const v = isRho ? 10 ** (Math.log10(lo) + t * (Math.log10(hi) - Math.log10(lo))) : lo + t * (hi - lo);
    g.fillStyle = colorForVoxelValue(model, v); g.fillRect(L + k, by, 1.5, bh);
  }
  g.strokeStyle = colors.textSecondary; g.strokeRect(L, by, bw, bh);
  g.fillStyle = colors.textSecondary; g.font = font(fpx(printPt.caption)); g.textBaseline = "top";
  g.textAlign = "left"; g.fillText(lo.toPrecision(3), L, by + bh + 5);
  g.textAlign = "right"; g.fillText(hi.toPrecision(3), L + bw, by + bh + 5);
  // #585 — the caption on its own line under the end values (at print size the three no longer fit on one)
  g.textAlign = "center"; g.fillText(isRho ? "Resistivity (ohm·m, log scale) — dark = conductive" : "Chargeability (mV/V)", L + bw / 2, by + bh + 5 + fpx(printPt.caption) * 1.3);
  // #535 — the hatch in the legend, next to the colour bar
  if (cutoff > 0 && L + bw + 40 + 200 < width) {
    const hx = L + bw + 40;
    g.fillStyle = hatch; g.fillRect(hx, by, 34, bh);
    g.strokeStyle = HATCH.line; g.strokeRect(hx, by, 34, bh);
    g.fillStyle = colors.textSecondary; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(`below the depth the data see (support < ${cutoff} at and beneath)`, hx + 42, by + bh / 2);
  }
  return { dataUrl: cv.toDataURL("image/png"), width, height, verticalExaggeration: ve };
}
