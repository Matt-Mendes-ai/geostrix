// TASKS.csv #2375 (review #2325, WA uranium) — 'Zoom to <hole>' from the Top view showed a vertical hole end-on as one disc.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeZoomPhi } from "../src/modules/viewer/zoomHole.js";

const deg = (r) => (r * 180) / Math.PI;
const vertical = [{ x: 0, y: 0, z: 0 }, { x: 0, y: -300, z: 0 }]; // scene y up: a vertical hole downward

test("from the Top view a vertical hole tilts the view to 45 degrees; from below, to 135", () => {
  assert.ok(Math.abs(deg(holeZoomPhi(vertical, 0.02, 0)) - 45) < 1e-9);
  assert.ok(Math.abs(deg(holeZoomPhi(vertical, Math.PI - 0.02, 1)) - 135) < 1e-9);
});

test("an oblique view of a vertical hole is kept", () => {
  assert.equal(holeZoomPhi(vertical, Math.PI / 3, 0.5), null);
});

test("looking down an inclined hole: a tilt that is at least 30 degrees off its axis", () => {
  // dip 60 toward scene +x: axis (cos60, -sin60, 0); a camera along it sits at phi 30 deg, theta 270 deg (on the -x side, above)
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 100 * Math.cos(Math.PI / 3), y: -100 * Math.sin(Math.PI / 3), z: 0 }];
  const theta = (3 * Math.PI) / 2, phi = Math.PI / 6;
  const p = holeZoomPhi(pts, phi, theta);
  assert.ok(p != null);
  const vx = Math.sin(p) * Math.sin(theta), vy = Math.cos(p), vz = Math.sin(p) * Math.cos(theta);
  const cos = Math.abs((pts[1].x * vx + pts[1].y * vy + pts[1].z * vz) / 100);
  assert.ok(cos <= Math.cos(Math.PI / 6) + 1e-9, `angle off the axis ${deg(Math.acos(cos))}`);
});

test("ViewerModule's Zoom to <hole> tilts first and frames the trace with a wider margin", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /ph = holeZoomPhi\(t\.pts, cs\.phi, cs\.theta\); if \(ph != null\) cs\.phi = ph;/);
  assert.match(v, /fitBox\(new THREE\.Box3\(\)\.setFromPoints\(t\.pts\.map\(\(p\) => new THREE\.Vector3\(p\.x, p\.y, p\.z\)\)\), 1\.6/);
});
