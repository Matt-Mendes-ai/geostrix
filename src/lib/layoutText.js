// TASKS.csv #2139 (review #2013) — a text '{date} · {scale} · {crs}' on a page with no scale printed '2026-11-08 ·  · NAD83 ...': an
// empty placeholder left its separators behind. Filled here, then a separator between two empty fills is dropped (and one at either end).
import { reprojectXY } from "./reproject.js"; // TASKS.csv #2712

const SEP = "[·|•–—/,;-]";
export function fillPlaceholders(text, ctx, re) {
  if (!ctx || typeof text !== "string" || !text.includes("{")) return text;
  let empty = false;
  const out = text.replace(re, (m, k) => { if (ctx[k] == null) return m; if (ctx[k] === "") empty = true; return ctx[k]; });
  if (!empty) return out;
  return out
    .split("\n")
    .map((line) => line
      .replace(new RegExp(`\\s*(${SEP})\\s*(?:${SEP}\\s*)+`, "g"), (m, s) => ` ${s} `) // 'a ·  · b' -> 'a · b'
      .replace(new RegExp(`^\\s*${SEP}\\s*`), "") // a line that began with the empty fill
      .replace(new RegExp(`\\s*${SEP}\\s*$`), "")) // or ended with it
    .join("\n");
}

// TASKS.csv #2712 (split from #2138) — {north} and {convergence} for a title block or a text: which north the page's maps are drawn to,
// and the angle between grid and true north. The convergence is the page's own GN / TN / MN diagram's when it has one (the figure then
// states one number), else it is computed at the collars' centre from the project's coordinate system: a 1 km step due true north,
// measured in the grid (as lib/inversion.js trueNorthBearingInGridDeg). A local grid, or no coordinate system: no convergence.
// -> the English name ("Grid north" / "Local grid north") for the caller to translate, or ""
export function northName(project) {
  if (project?.crsSet === false) return "Local grid north";
  return project?.epsg ? "Grid north" : "";
}
// -> degrees, true north measured clockwise from grid north, or null
export function pageConvergence(els, project, collars) {
  const d = (els || []).find((e) => e?.type === "north" && Number.isFinite(e?.decl?.convergence));
  if (d) return d.decl.convergence;
  if (project?.crsSet === false || !project?.epsg) return null;
  let sx = 0, sy = 0, n = 0;
  for (const c of collars || []) { const x = Number(c?.x), y = Number(c?.y); if (Number.isFinite(x) && Number.isFinite(y)) { sx += x; sy += y; n++; } }
  if (!n) return null;
  const x = sx / n, y = sy / n, ll = reprojectXY(x, y, project.epsg, 4326);
  if (!ll) return null;
  const up = reprojectXY(ll.x, ll.y + 0.009, 4326, project.epsg);
  if (!up) return null;
  return (Math.atan2(up.x - x, up.y - y) * 180) / Math.PI;
}
// 1.2° E / 0.4° W, as the north diagram prints it
export const formatConvergence = (a) => (Number.isFinite(a) ? `${Math.abs(a).toFixed(1)}° ${a >= 0 ? "E" : "W"}` : "");
