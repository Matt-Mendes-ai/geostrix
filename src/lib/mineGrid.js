// TASKS.csv #2586 (review #2486, WA lithium) — a project on a real CRS (MGA) that also carries a named mine grid. The local-grid tie (#2288)
// exists only while the CRS is "not set", so on an MGA project a mine-grid outline with no .prj landed 6,240 km from the collars and could
// not be moved onto them. Here project.mineGrid = { name, tie } holds the same kind of tie (lib/localGridTie.js: mine grid -> tie.epsg,
// a 2D similarity), beside the project's own CRS; project.localGrid keeps meaning "no CRS" (#2180). Pure: no UI.
import { localToWorld, worldToLocal } from "./localGridTie.js";
import { reprojectXY } from "./reproject.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #2684 — the mine-grid Source CRS notes

// the project's mine grid, when it has a CRS and a tie
export function mineGridOf(project) {
  const mg = project?.crsSet !== false ? project?.mineGrid : null;
  const t = mg?.tie;
  return t && Number(t.epsg) > 0 && [t.a, t.b, t.tx, t.ty].every(Number.isFinite) ? { name: String(mg.name || "").trim(), tie: t } : null;
}

// mine-grid metres -> the project CRS (through the tie's CRS when the project has since moved to another)
export function mineToProject(mg, projectEpsg) {
  const dst = Number(projectEpsg), te = Number(mg.tie.epsg);
  return (x, y) => {
    const w = localToWorld(mg.tie, x, y);
    if (!dst || dst === te) return [w.x, w.y];
    const r = reprojectXY(w.x, w.y, te, dst);
    return r && Number.isFinite(r.x) ? [r.x, r.y] : [NaN, NaN];
  };
}

// the collars' box on the mine grid (collars in the project CRS)
function collarsGridBox(mg, collars, projectEpsg) {
  const dst = Number(projectEpsg), te = Number(mg.tie.epsg);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
    const w = dst && dst !== te ? reprojectXY(c.x, c.y, dst, te) : { x: c.x, y: c.y };
    if (!w || !Number.isFinite(w.x)) continue;
    const l = worldToLocal(mg.tie, w.x, w.y);
    if (l.x < x0) x0 = l.x; if (l.x > x1) x1 = l.x; if (l.y < y0) y0 = l.y; if (l.y > y1) y1 = l.y;
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

const overlaps = (a, b, pad) => a[2] >= b[0] - pad && a[0] <= b[2] + pad && a[3] >= b[1] - pad && a[1] <= b[3] + pad;

// a file with no CRS: do its coordinates lie where the collars are on the mine grid, and NOT where they are in the project CRS?
// box: the file's [xmin, ymin, xmax, ymax]. A margin of the collars' own size (at least 2 km) either way.
export function readsAsMineGrid(box, mg, collars, projectEpsg) {
  if (!mg || !box || !box.every(Number.isFinite)) return false;
  const g = collarsGridBox(mg, collars, projectEpsg);
  if (!g) return false;
  const pad = Math.max(2000, Math.hypot(g[2] - g[0], g[3] - g[1]));
  const p = projectBoxOf(collars);
  return overlaps(box, g, pad) && !(p && overlaps(box, p, pad));
}

function projectBoxOf(collars) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of collars || []) { if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue; if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

// how far (km) a box, in the project CRS, lies from the collars' centre; null with no collars
export function kmFromCollars(box, collars) {
  const p = projectBoxOf(collars);
  if (!p || !box || !box.every(Number.isFinite)) return null;
  const cx = (p[0] + p[2]) / 2, cy = (p[1] + p[3]) / 2, bx = (box[0] + box[2]) / 2, by = (box[1] + box[3]) / 2;
  return Math.hypot(bx - cx, by - cy) / 1000;
}

// [xmin, ymin, xmax, ymax] of [[x, y]] parts
export function partsBox(parts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const part of parts || []) for (const pt of part || []) { const x = pt[0], y = pt[1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

// collars carrying a second pair of coordinates (GBMG_East / GBMG_North beside MGA): the numeric fields in attrs on most collars
export function collarCoordinateFields(collars) {
  const n = new Map();
  let total = 0;
  for (const c of collars || []) {
    total++;
    for (const [k, v] of Object.entries(c?.attrs || {})) if (v !== "" && v != null && Number.isFinite(Number(v))) n.set(k, (n.get(k) || 0) + 1);
  }
  return [...n.entries()].filter(([, k]) => total && k >= total * 0.9).map(([k]) => k);
}

// control-point text from the collars: "mineE mineN projE projN" per collar that has both
export function collarControlText(collars, eField, nField, max = 2000) {
  const lines = [];
  for (const c of collars || []) {
    const e = Number(c?.attrs?.[eField]), n = Number(c?.attrs?.[nField]);
    if (Number.isFinite(e) && Number.isFinite(n) && Number.isFinite(c.x) && Number.isFinite(c.y)) lines.push(`${e} ${n} ${c.x} ${c.y}`);
    if (lines.length >= max) break;
  }
  return lines.join("\n");
}

// TASKS.csv #2684 (#2275 / #2586's open part) — 'Local mine grid (no CRS)' as an explicit Source CRS answer (components/SourceCrsField.jsx
// value "mine"). Before, a file on the mine grid was read on it only when it stated no CRS AND lay where the collars are on the grid
// (readsAsMineGrid); anything else was taken as the project CRS. What the answer means depends on the project:
//   "tie"   a CRS project with a mine grid beside it (mineGridOf): read on the grid, brought into the project CRS through its tie;
//   "local" a project with no CRS (a local grid, #2180, tied or not): the numbers are the project's own, kept as they are;
//   "none"  a CRS project with no mine grid: nothing to read it on (the picker shows the answer disabled, saying where to set one up).
export const MINE_SOURCE = "mine";
export const isMineSource = (v) => String(v ?? "").trim().toLowerCase() === MINE_SOURCE;
export function mineSourceOf(project) {
  if (!project) return null;
  if (project.crsSet === false) return { kind: "local", name: String(project.localGrid?.name || "").trim() };
  const mg = mineGridOf(project);
  return mg ? { kind: "tie", name: mg.name, epsg: Number(project.epsg) || null, mg } : { kind: "none", name: "" };
}
// (x, y) on the mine grid -> [x, y] in the project's coordinates; null when the project has no mine grid to read on
export const mineSourceToProject = (project) => mineChoiceToProject(mineSourceOf(project), project?.epsg);
// the same from a mineSourceOf result (what SourceCrsField's mineGrid prop holds), and its inverse (project -> the grid's numbers)
export function mineChoiceToProject(s, projectEpsg) {
  if (!s || s.kind === "none") return null;
  if (s.kind === "local") return (x, y) => [x, y];
  return mineToProject(s.mg, projectEpsg);
}
export function mineChoiceFromProject(s, projectEpsg) {
  if (!s || s.kind === "none") return null;
  if (s.kind === "local") return (x, y) => [x, y];
  return projectToMine(s.mg, projectEpsg);
}
// the project CRS -> the mine grid (mineToProject's inverse)
export function projectToMine(mg, projectEpsg) {
  const src = Number(projectEpsg), te = Number(mg.tie.epsg);
  return (X, Y) => {
    const w = src && src !== te ? reprojectXY(X, Y, src, te) : { x: X, y: Y };
    if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y)) return [NaN, NaN];
    const l = worldToLocal(mg.tie, w.x, w.y);
    return [l.x, l.y];
  };
}
// what an import says when it was read on the mine grid (lower case, joins a sentence as the other CRS notes do)
export function mineSourceNote(s, projectEpsg) {
  if (s?.kind === "local") return s.name ? tr("read as the local grid \"{name}\" (the Source CRS you set): its numbers were kept as they are", { name: s.name }) : tr("read as the project's local grid (the Source CRS you set): its numbers were kept as they are");
  if (s?.kind === "tie") return tr("read on the project's mine grid{grid} (the Source CRS you set) and brought into EPSG:{dst} through its tie", { grid: s.name ? ` (${s.name})` : "", dst: Number(projectEpsg) || s.epsg });
  return tr("the project has no mine grid to read it on (set one up under Maps > Project CRS): the coordinates were kept as they are, check where it lies");
}
// the same note as a sentence of its own, with a leading space (the point imports' " Reprojected from …" style)
export function mineSourceSentence(s, projectEpsg) {
  const n = mineSourceNote(s, projectEpsg);
  return ` ${n.charAt(0).toUpperCase()}${n.slice(1)}.`;
}
// rows with x / y on the mine grid -> the project's coordinates. -> { rows, note } (rows unchanged when the project has no mine grid)
export function mineRowsToProject(rows, project) {
  const s = mineSourceOf(project), T = mineSourceToProject(project);
  const out = T ? rows.map((r) => { const [x, y] = T(r.x, r.y); return Number.isFinite(x) && Number.isFinite(y) ? { ...r, x, y } : r; }) : rows;
  return { rows: out, note: mineSourceSentence(s, project?.epsg) };
}
