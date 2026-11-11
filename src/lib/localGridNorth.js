// TASKS.csv #2491 (review #2486, WA lithium) — a survey measured from true (or magnetic) north, imported into a project kept on its
// mine grid: the azimuths were left as true bearings (15.1 degrees off on 1,261 inclined holes) with a notice telling the user to choose
// a CRS, which a local grid cannot do. A local grid TIED to a real CRS (#2288) knows its north: true -> the tie CRS's grid north by the
// convergence (and the declination for magnetic) at the hole's place in that CRS, then -> the local grid by the tie's rotation (#490).
import { azimuthToGridOffset } from "./azimuthRef.js";
import { localToWorld } from "./localGridTie.js";

// -> { offset, convergence, declination?, rotationDeg } to ADD to a true / magnetic bearing at local point (lx, ly), or null
export function localGridAzimuthOffset(ref, tie, lx, ly, isoDate) {
  if (!tie || !Number.isFinite(lx) || !Number.isFinite(ly)) return null;
  const w = localToWorld(tie, lx, ly);
  const o = azimuthToGridOffset(ref, w.x, w.y, tie.epsg, isoDate);
  if (!o || !Number.isFinite(o.offset)) return null;
  return { ...o, rotationDeg: tie.rotationDeg, offset: o.offset + tie.rotationDeg };
}
