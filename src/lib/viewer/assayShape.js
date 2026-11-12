// TASKS.csv #2932 (WA iron review) — assays were drawn one 10 x 10 sphere (180 triangles) per sample: Fe on 147,891 samples took the orbit
// from 55-60 to 14-19 frames a second, and Fe + SiO2 + Al2O3 + LOI (590,000 spheres) to 6, where the strand log's 150,455 intervals
// (6-sided cylinders, 24 triangles) orbit at 43-55. An assay can now be drawn "along the hole": the same shared 6-sided cylinder from
// the sample's from to its to, as thick as its sphere would be wide (grade still sets the size). The default shape (none stored) is
// automatic: spheres up to ASSAY_AUTO_LIMIT samples to draw, along the hole above it; the user's own shape always wins.
import { PIN_AXIS, dipPinDir, PROTO_CYLINDER, PROTO_SPHERE_10, POINT_PROTO } from "./protos.js";

export const ASSAY_AUTO_LIMIT = 40000;
export const ASSAY_TRACE = "trace";

// the shape a build draws: the stored one, else spheres or (above the limit) along the hole. A pXRF reading stays a cube (#1695).
export function assayShapeFor(style, drawnCount, pxrf = false) {
  if (pxrf) return "cube";
  const s = style?.shape;
  if (s === ASSAY_TRACE || POINT_PROTO[s]) return s;
  return drawnCount > ASSAY_AUTO_LIMIT ? ASSAY_TRACE : "sphere";
}

export const assayProto = (shape) => (shape === ASSAY_TRACE ? PROTO_CYLINDER : POINT_PROTO[shape] || PROTO_SPHERE_10);

// places one marker: a point shape at the sample's mid-depth, scaled by `size`; along the hole, a cylinder of radius `size` from `from`
// to `to` (at = the trace lookup, traceLookup(pts).at). off = the element's offset around the trace. false when nothing can be drawn.
export function placeAssayMarker(mesh, shape, at, row, size, offX = 0, offZ = 0) {
  if (shape !== ASSAY_TRACE) {
    const p = at((row.from + row.to) / 2);
    if (!p) return false;
    mesh.scale.setScalar(size);
    mesh.position.set(p.x + offX, p.y, p.z + offZ);
    return true;
  }
  const p1 = at(row.from), p2 = at(row.to);
  if (!p1 || !p2) return false;
  const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!(len > 1e-6)) { mesh.scale.set(size, 0.5, size); mesh.position.set(p1.x + offX, p1.y - 0.25, p1.z + offZ); return true; } // a zero-length sample: a 0.5 m disc
  mesh.scale.set(size, len, size);
  mesh.position.set(p1.x + offX, p1.y, p1.z + offZ);
  mesh.quaternion.setFromUnitVectors(PIN_AXIS, dipPinDir.set(dx / len, dy / len, dz / len));
  return true;
}
