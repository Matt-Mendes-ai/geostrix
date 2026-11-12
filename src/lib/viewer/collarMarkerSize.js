// TASKS.csv #2823 (a user's report, High) — collar markers were a fixed 3.2 m-radius sphere (6.4 m across, #312): on an underground
// grade-control drive (145 holes, median 2.3 m long, 1.0 m apart) every marker covered its own hole and its neighbours, and the drive drew
// as one black band. The radius now comes from the drilling, with a 'Collar marker size' setting (Auto / a size in m / Off) saved with
// the view (figureOverlay.collarSize, beside #2623's vertical exaggeration). A resize is a scale on each marker plus a batch sync, never a
// rebuild; picking (#304 / #1643) tests the members' own matrices, so it follows the drawn size.
import { COLLAR_MARKER_UNIFORMS } from "./collarMarkerShader.js";
import { eachLayerMember, syncBatchedInstances } from "./layerBatches.js";
import { median } from "../arrayStats.js"; // #1114 — NaN when empty

export const DEFAULT_COLLAR_RADIUS = 3.2; // m — what every project had before
const MIN_RADIUS = 0.05, DUPLICATE_M = 0.01;
const DEFAULT_FLOOR_PX = 2.5; // #2623


// The median distance from each collar to its nearest other collar (3D, metres), collars at the same spot (fans from one pad, under
// 1 cm) not counting as neighbours. points: [{ x, y, z }]. Sorted along the longer plan axis and scanned while the gap on that axis is
// under the best distance so far: O(n log n) on spread drilling, and fine on a drive (145 holes) or a grid.
export function medianCollarSpacing(points) {
  const p = (points || []).filter((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y) && Number.isFinite(q?.z));
  if (p.length < 2) return NaN;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
  const ax = x1 - x0 >= z1 - z0 ? "x" : "z"; // scene x = east, z = -north (y is up)
  const s = [...p].sort((a, b) => a[ax] - b[ax]), nn = [];
  for (let i = 0; i < s.length; i++) {
    let best = Infinity;
    for (const dir of [-1, 1]) {
      for (let j = i + dir; j >= 0 && j < s.length; j += dir) {
        const dAx = Math.abs(s[j][ax] - s[i][ax]);
        if (dAx >= best) break;
        const d = Math.hypot(s[j].x - s[i].x, s[j].y - s[i].y, s[j].z - s[i].z);
        if (d > DUPLICATE_M && d < best) best = d;
      }
    }
    if (Number.isFinite(best)) nn.push(best);
  }
  return median(nn);
}

// The automatic radius: small enough not to cover the neighbouring holes (0.3 x the median collar spacing) unless the holes are long
// enough for a big marker not to hide them (0.05 x the median hole length: pads of deep holes, e.g. Silvertip's 1.75 m apart, keep
// today's look); never above 3.2 m (wide-spaced projects look as before) nor under 5 cm. anchors: the build's hole anchors
// ({ x, y, z, depth }, holeLabelAnchorsRef).
export function autoCollarRadius(anchors) {
  const spacing = medianCollarSpacing(anchors);
  if (!Number.isFinite(spacing)) return DEFAULT_COLLAR_RADIUS;
  const len = median((anchors || []).map((a) => a?.depth).filter((d) => Number.isFinite(d) && d > 0));
  const r = Math.max(MIN_RADIUS, 0.3 * spacing, Number.isFinite(len) ? 0.05 * len : 0);
  return +Math.min(DEFAULT_COLLAR_RADIUS, r).toFixed(3);
}

// setting: undefined / "auto" -> autoCollarRadius; "off" -> 0 (hidden, traces kept); a number of metres > 0 -> that radius
export function resolveCollarRadius(setting, anchors) {
  if (setting === "off") return 0;
  const n = Number(setting);
  if (setting != null && setting !== "auto" && setting !== "" && Number.isFinite(n) && n > 0) return n;
  return autoCollarRadius(anchors);
}

// #2623's pixel floor (a marker is never drawn under 2.5 px) kept for full-size markers; a smaller marker's floor shrinks with it, to 1 px,
// so a 0.3 m marker is not blown back up to a blob over the drive at Fit
export const floorPxFor = (r) => (r >= DEFAULT_COLLAR_RADIUS ? DEFAULT_FLOOR_PX : r > 0 ? Math.max(1, (DEFAULT_FLOOR_PX * r) / DEFAULT_COLLAR_RADIUS) : 0);

// Every collar marker of the holes group (flagged userData.collarMarker by drillholeScene) at radius r (0: scale 0, nothing drawn or
// picked), mirrored into the batches; the shader floor follows. Returns how many markers were set.
export function applyCollarMarkerSize(holesGroup, r) {
  if (!holesGroup) return 0;
  let n = 0;
  eachLayerMember(holesGroup, (m) => {
    if (!m.userData?.collarMarker || !m.scale) return;
    m.scale.setScalar(r);
    m.updateMatrix(); m.updateMatrixWorld();
    n++;
  });
  for (const c of holesGroup.children) if (c.isInstancedMesh && c.userData.batchMembers) syncBatchedInstances(c);
  COLLAR_MARKER_UNIFORMS.uMinPx.value = floorPxFor(r);
  return n;
}
