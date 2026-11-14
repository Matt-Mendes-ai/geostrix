// TASKS.csv #3466 (from #2298 / #2998) — a longitude / latitude graticule for the Maps plan's grid: the zone boundary or a point from a report in
// degrees can be found on a plan that is drawn in metres. Pure: the plan passes its view box and the CRS's two transforms.
// view: [xmin, ymin, xmax, ymax] in the project CRS; toLL(x, y) -> [lon, lat] | null; toXY(lon, lat) -> [x, y] | null.
const STEPS = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
export const graticuleStep = (spanDeg, want = 4) => STEPS.find((s) => spanDeg / s <= want * 2) || STEPS[STEPS.length - 1];
// -> { step, lines: [{ kind: "lon" | "lat", value, pts: [{ x, y }] }] } over the view, or null when the corners cannot be converted
export function graticule(view, toLL, toXY, { samples = 16, maxLines = 24 } = {}) {
  const corners = [[view[0], view[1]], [view[2], view[1]], [view[2], view[3]], [view[0], view[3]]].map(([x, y]) => toLL(x, y));
  if (corners.some((c) => !c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]))) return null;
  let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
  for (const [lo, la] of corners) { if (lo < lo0) lo0 = lo; if (lo > lo1) lo1 = lo; if (la < la0) la0 = la; if (la > la1) la1 = la; }
  const step = graticuleStep(Math.max(lo1 - lo0, la1 - la0));
  const lines = [];
  const inside = (p) => p && p[0] >= view[0] - 1e-9 && p[0] <= view[2] + 1e-9 && p[1] >= view[1] - 1e-9 && p[1] <= view[3] + 1e-9;
  const run = (kind, from, to, at) => {
    for (let v = Math.ceil(from / step - 1e-9) * step, n = 0; v <= to + 1e-9 && n < maxLines; v += step, n++) {
      const value = Math.round(v / step) * step, pts = [];
      for (let i = 0; i <= samples; i++) {
        const t = i / samples, w = kind === "lon" ? la0 + (la1 - la0) * t : lo0 + (lo1 - lo0) * t;
        const p = kind === "lon" ? toXY(value, w) : toXY(w, value);
        if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push({ x: p[0], y: p[1] });
      }
      if (pts.length > 1 && pts.some((q) => inside([q.x, q.y]))) lines.push({ kind, value, pts });
    }
  };
  run("lon", lo0, lo1); run("lat", la0, la1);
  return { step, lines };
}
export const graticuleLabel = (kind, v, step) => {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : step >= 0.001 ? 3 : 4;
  const a = Math.abs(v).toFixed(d);
  return kind === "lon" ? `${a}°${v < 0 ? "W" : v > 0 ? "E" : ""}` : `${a}°${v < 0 ? "S" : v > 0 ? "N" : ""}`;
};
