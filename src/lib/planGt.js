// TASKS.csv #2755 (split from #2419) — Grade × thickness on the Maps tab's plan: the per-hole totals of 3D Modelling > Grade × thickness in
// plan (lib/accumulation.js holeTotals, computed there with the cut-off and rules the user typed: never a second time here) shown as
// graduated collars, circle AREA proportional to GT as the modal draws them, and the GT contour added as a map layer (a vector layer:
// drawn on the plan and in the 3D View, exported like any other). The plan's GT is session state, as the plan's other display choices are;
// the contour layer is project data. A window event, as lib/planZoom.js does; the last one is kept for a plan that mounts later.
import { useEffect, useState } from "react";

const EVENT = "geostrix-plan-gt";
let last = null;

// payload: { symbol, label (the GT unit, e.g. 'm·ppm'), title (what it is, English), holes: [{ hole_id, x, y, gt, thicknessM }] } or null to clear
export function showGtOnPlan(payload) {
  last = payload && Array.isArray(payload.holes) && payload.holes.length ? payload : null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: last }));
}
export function usePlanGt() {
  const [gt, setGt] = useState(last);
  useEffect(() => {
    const on = (e) => setGt(e.detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return gt;
}

// a circle's radius in px with its area proportional to GT (the largest GT at maxPx); 0 or no GT -> null (drawn as a hollow ring)
export function gtRadius(gt, maxGt, maxPx = 11) {
  if (!(gt > 0) || !(maxGt > 0)) return null;
  return Math.max(1.5, maxPx * Math.sqrt(gt / maxGt));
}
const nice = (v) => { if (!(v > 0)) return 0; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };
// the legend's circles: the largest GT rounded down to 1, 2 or 5 x a power of ten, a quarter of it and a sixteenth (areas 1 : 1/4 : 1/16),
// each with its radius; duplicates and zeros dropped
export function gtLegend(maxGt, maxPx = 11) {
  const top = nice(maxGt);
  const vals = [top, nice(top / 4), nice(top / 16)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  return vals.map((v) => ({ gt: v, r: gtRadius(v, maxGt, maxPx) }));
}

// marching-squares segments [[x1, y1, x2, y2]] (lib/accumulation.js contourSegments) joined into polylines [[x, y], …] where their ends meet
export function joinSegments(segs, tol = 1e-6) {
  const key = (x, y) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  const ends = new Map(), used = new Uint8Array(segs.length);
  segs.forEach((s, i) => { for (const k of [key(s[0], s[1]), key(s[2], s[3])]) (ends.get(k) || ends.set(k, []).get(k)).push(i); });
  const other = (i, k) => (ends.get(k) || []).find((j) => j !== i && !used[j]);
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]];
    for (const atEnd of [true, false]) { // grow from the tail, then from the head
      for (;;) {
        const p = atEnd ? line[line.length - 1] : line[0], k = key(p[0], p[1]), j = other(i, k);
        if (j == null) break;
        used[j] = 1;
        const s = segs[j], first = key(s[0], s[1]) === k, q = first ? [s[2], s[3]] : [s[0], s[1]];
        if (atEnd) line.push(q); else line.unshift(q);
      }
    }
    lines.push(line);
  }
  return lines;
}

// the contour as a map layer (project data, English): one polyline feature per joined line, GT and the element as attributes
export function gtContourLayer(segs, { level, label, symbol, cellM = null, color = "#c2410c" }) {
  const cell = Number(cellM) > 0 ? Number(cellM) : 1;
  const lines = joinSegments(segs, cell * 1e-6);
  if (!lines.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (const [x, y] of l) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const name = `GT ${level} ${label} contour (${symbol})`;
  return {
    name, sourceName: name, geomType: "polyline",
    features: lines.map((l) => ({ geometry: l, parts: [l], attributes: { GT: level, unit: label, element: symbol } })),
    fields: ["GT", "unit", "element"], styleField: null, categories: [], color, opacity: 1, bbox: [x0, y0, x1, y1], drapeMode: "terrain",
    crsNote: "the project CRS (made in GeoStrix: Grade × thickness in plan)",
  };
}
