// TASKS.csv #3624 (Fireweed rehearsal) — the camera is saved with the project (viewerUiState.camera) and put back on open; with a filter and no camera, Fit frames the checked holes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cameraSnapshot, cameraKey, applySavedCamera } from "../src/modules/viewer/savedCamera.js";
import { stylingKey } from "../src/lib/viewerDirty.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const vec = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });

test("#3624 a snapshot is the camera's numbers rounded; a camera not ready gives null", () => {
  const cs = { theta: 0.7853981633, phi: 1.0471975512, radius: 1800.123456, target: vec(416004.1234, 7000079.9999, 1500.5) };
  assert.deepEqual(cameraSnapshot(cs), { theta: 0.785, phi: 1.047, radius: 1800.123, target: { x: 416004.123, y: 7000080, z: 1500.5 } });
  assert.equal(cameraSnapshot(null), null); assert.equal(cameraSnapshot({ theta: NaN, phi: 1, radius: 5, target: vec(0, 0, 0) }), null);
  assert.equal(cameraKey(null), ""); assert.equal(cameraKey(cameraSnapshot(cs)), "0.785|1.047|1800.123|416004.123|7000080|1500.5");
});

test("#3624 a saved camera is put back on the live one and the first auto-fit is switched off; a bad one is ignored", () => {
  const cs = { theta: 0.1, phi: 0.2, radius: 600, target: vec(0, 0, 0) }, camState = { current: cs }, fit = { current: false };
  let updated = 0; const cameraRef = { current: { __update: () => { updated++; } } };
  assert.equal(applySavedCamera({ theta: 1, phi: 1.2, radius: 1800, target: { x: 5, y: 6, z: 7 } }, camState, cameraRef, fit), true);
  assert.deepEqual([cs.theta, cs.phi, cs.radius, cs.target.x, cs.target.y, cs.target.z], [1, 1.2, 1800, 5, 6, 7]);
  assert.equal(fit.current, true); assert.equal(updated, 1);
  const fit2 = { current: false };
  assert.equal(applySavedCamera({ theta: 1, phi: 1, radius: -3, target: { x: 0, y: 0, z: 0 } }, camState, cameraRef, fit2), false);
  assert.equal(applySavedCamera(null, camState, cameraRef, fit2), false); assert.equal(fit2.current, false);
});

test("#3624 the camera is not a styling field: orbiting does not mark the project unsaved", () => {
  assert.equal(stylingKey({ layerVisible: { a: 1 }, camera: { radius: 1 } }), stylingKey({ layerVisible: { a: 1 }, camera: { radius: 99999 } }));
});

test("#3624 the view reads the saved camera on open, keeps it across its own state pushes, and (master's #3555) frames a filter's holes", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /setSavedCamera\(s\?\.camera \|\| null\); if \(s\?\.camera\) applySavedCamera\(s\.camera, camState, cameraRef, hasAutoFitRef\);/);
  assert.match(v, /holeFilter, camera: savedCamera, \/\/ #3624[^\n]*\n      modelArea, \/\/ #2535\n      fenceArea, \/\/ #3971\n    \};\n    setViewerUiState\(ui\);/); // the one writer of viewerUiState (#1287) carries both
  assert.match(v, /useSavedCamera\(camState, hydratedFor === viewerUiStateSeq, setSavedCamera\);/);
  assert.match(v, /autoFitInitial = useCallback\(\(traces, nHoles\) => \{ const hole = nHoles \? traces\.slice\(0, nHoles\) : traces,/); // #3555 (master): the holes shown, when some are hidden
});

test("#3624 the hole filter's rule is saved with the checks and read back (and cleared for a new project)", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /setHoleFilter\(s\.holeFilter \|\| ""\); \/\/ #3624/);
  assert.match(v, /setModelArea\("all"\); setHoleFilter\(""\); \/\/ #2535; #3624/);
  assert.match(v, /markViewerUiBaseline, modelArea, holeFilter, savedCamera, fenceArea\]\);/); // fenceArea: #3971
});
