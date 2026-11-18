// TASKS.csv #3898 — "Build it for me" for a modelled surface (the implicit model of logged units): the model box and its resolution from
// the contacts the logs give and the drill spacing. A surface between holes cannot be drawn finer than the holes allow, so the cells
// aim at about half the spacing between drill sites; the per-axis counts then follow the box's shape (lib/modelResolution.js, #2624),
// inside the engine's limits.
//
// input: { collars, contacts: [{ hole_id, x, y, z }] (desurveyed contacts between logged units, e.g. the boundary intercepts),
//          hasLogs: whether the project has any lithology / unit logs }
// -> values: { extent: [xmin, xmax, ymin, ymax, zmin, zmax], resolution (the cube count n of the Resolution setting), axes: [nx, ny, nz],
//              cellsM: [dx, dy, dz] }
import { axisResolution, blockCellsM, RES_MIN, RES_MAX } from "../modelResolution.js";
import { thin, fin, median, metres, siteSpacing, extentOf, holesOf, autoResult, because, say } from "./autoCommon.js";

// maxResolution (TASKS.csv #3908): a first, quick model. The guided tools pass QUICK_RESOLUTION so "Build it for me" stays within the engine's
// few-minute run (on the WA lode gold sample, 96 was a 14-minute GemPy run); Change these opens the form to go finer.
export const QUICK_RESOLUTION = 48;
export function autoSurface({ collars = [], contacts = [], hasLogs = false, maxResolution = RES_MAX } = {}) {
  const top = Math.max(RES_MIN, Math.min(RES_MAX, maxResolution));
  const pts = thin(contacts.filter((c) => fin(c.x) && fin(c.y) && fin(c.z)));
  const holes = holesOf(pts), problems = [], notes = [];
  if (!pts.length) problems.push(hasLogs ? say("The logs give no contacts between units: every hole is logged as one unit, so there is no surface to model.")
    : say("The project has no logs: a surface is modelled from the contacts between logged units. Import a lithology log first."));
  else if (holes < 3) problems.push(holes === 1 ? say("Contacts in only one hole: a surface needs contacts in three or more holes.") : say("Contacts in only {n} holes: a surface needs contacts in three or more holes.", { n: holes }));
  // the spacing of the drill sites that cut the contacts (the collars when given, else the contacts' own positions)
  const { spacing } = siteSpacing(collars.length ? collars : pts);
  if (!problems.length && !spacing) problems.push(say("The holes are too few or too close together to measure their spacing, so the size of the model cannot be read from them."));
  if (problems.length) return autoResult(null, [], notes, problems);

  const reasons = [];
  // the box: the contacts and one drill spacing beyond them across (a surface runs on past the last hole), and a quarter of their
  // vertical spread above and below, at least a quarter of the spacing
  const e = extentOf(pts), padZ = Math.max((e.maxZ - e.minZ) / 4, spacing / 4);
  const extent = [e.minX - spacing, e.maxX + spacing, e.minY - spacing, e.maxY + spacing, e.minZ - padZ, e.maxZ + padZ].map((v) => +v.toFixed(2));
  reasons.push(because("extent", "The model box holds the contacts, one drill spacing ({s} m) beyond them across and {z} m above and below them.", { s: metres(spacing), z: metres(padZ) }));

  // the resolution: the cube count whose cells across come closest to half the drill spacing, made finer where needed so the units are
  // at least three cells thick (a third of the median gap between successive contacts down a hole)
  const target = spacing / 2, byHole = new Map();
  for (const c of pts) { if (!byHole.has(c.hole_id)) byHole.set(c.hole_id, []); byHole.get(c.hole_id).push(c.z); }
  const gaps = [];
  for (const zs of byHole.values()) { zs.sort((a, b) => b - a); for (let i = 1; i < zs.length; i++) if (zs[i - 1] - zs[i] > 0) gaps.push(zs[i - 1] - zs[i]); }
  const gap = gaps.length ? median(gaps) : null;
  let best = null, n = RES_MIN;
  for (; n <= top; n++) {
    const axes = axisResolution(extent, n), cells = blockCellsM(extent, axes), across = Math.max(cells[0], cells[1]), miss = Math.abs(across - target);
    if (!best || miss < best.miss) best = { n, axes, cells, across, miss };
  }
  if (gap && best.cells[2] > gap / 3) {
    for (n = best.n; n <= top; n++) { const axes = axisResolution(extent, n), cells = blockCellsM(extent, axes); best = { n, axes, cells, across: Math.max(cells[0], cells[1]) }; if (cells[2] <= gap / 3) break; }
  }
  const cellsM = best.cells.map((v) => +v.toFixed(2));
  // each sentence only claims what the cells are: the quick cap or the engine's grid can leave them coarser than the aim (said in the notes)
  if (best.across <= target * 1.05) reasons.push(because("resolution", "Cells about {x} m across: no coarser than half the spacing between drill sites ({s} m), the detail the holes can show between them.", { x: metres(best.across), s: metres(spacing) }));
  else reasons.push(because("resolution", "Cells about {x} m across; half the spacing between drill sites ({s} m) would be {t} m.", { x: metres(best.across), s: metres(spacing), t: metres(target) }));
  if (gap && cellsM[2] <= (gap / 3) * 1.05) reasons.push(because("resolution", "Cells {z} m high: the units are about {g} m thick between contacts down the holes, so each is at least three cells thick where the engine allows.", { z: metres(cellsM[2]), g: metres(gap) }));
  else if (gap) reasons.push(because("resolution", "Cells {z} m high; the units are about {g} m thick between contacts down the holes.", { z: metres(cellsM[2]), g: metres(gap) }));
  const capped = top < RES_MAX && best.n === top && ((gap && cellsM[2] > gap / 3) || best.across > target * 1.5);
  if (capped) notes.push(say("For a quick first model the detail is kept to Resolution {n}: raise it under Change these for finer cells, in a longer run.", { n: top }));
  else if (gap && cellsM[2] > gap / 3) notes.push(say("The units are thin for the engine's finest grid: some are under three cells thick. Model a smaller area for more detail."));
  if (!capped && best.across > target * 1.5) notes.push(say("The area is large for the engine's finest grid: the cells are {x} m across, coarser than the drilling. Model a smaller area for more detail.", { x: metres(best.across) }));
  if (holes < 6) notes.push(say("Contacts in only {n} holes: between them the surface is a broad guess. Check it on a section.", { n: holes }));
  return autoResult({ extent, resolution: best.n, axes: best.axes, cellsM }, reasons, notes, problems);
}
