// TASKS.csv #2934 (WA iron review) / #2664 — Fit and Zoom to hole framed the true box under vertical exaggeration (at 20x Fit cut both ends of
// the field; at 10x Zoom to hole left the collar off screen), and the exaggeration was only in Advanced > Figure. fitBox now scales the box's
// height by VE (the view stretches about the orbit target, which fitBox puts at the box's centre), and a VE select sits under Top / Bottom /
// Fit in both ribbon modes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { veMatrix } from "../src/modules/viewer/verticalExaggeration.js";

const src = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

// fitBox's radius rule, as in ViewerModule (padFactor 1.3, the minimum radius 80)
const fitRadius = (box, ve, pad = 1.3, min = 80) => { const s = box.getSize(new THREE.Vector3()); return Math.max(min, s.setY(s.y * ve).length() * pad); };

test("the fitted radius holds every corner of the box as drawn (stretched about its centre), at 1x to 20x", () => {
  const field = new THREE.Box3(new THREE.Vector3(-10800, 380, -8700), new THREE.Vector3(10800, 480, 8700)); // the review's 21.6 x 17.4 km, 100 m of holes
  const hole = new THREE.Box3(new THREE.Vector3(0, 400, 0), new THREE.Vector3(0.5, 450, 0.5)); // a 50 m vertical hole
  for (const box of [field, hole]) for (const ve of [1, 2, 5, 10, 20]) {
    const c = box.getCenter(new THREE.Vector3()), S = veMatrix(ve, c.y), r = fitRadius(box, ve);
    let far = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) far = Math.max(far, new THREE.Vector3(x, y, z).applyMatrix4(S).distanceTo(c));
    // r / 1.3066 is the radius of the sphere the view frames from any angle (#313): the drawn corners must lie inside it
    assert.ok(far <= (r / 1.3066) * 1.0001, `ve ${ve}: corner ${far.toFixed(1)} m vs framed ${(r / 1.3066).toFixed(1)} m`);
  }
  // the zoomed hole at 10x: framed for 500 m of drawn hole, not the true 50 m (the collar was off screen)
  assert.ok(fitRadius(hole, 10) > 600 && fitRadius(hole, 1) === 80);
});

test("wiring: fitBox reads the camera's VE; the view's VE select under Fit writes the Figure setting", () => {
  assert.match(src, /size = s\.setY\(s\.y \* \(cameraRef\.current\?\.userData\?\.ve \|\| 1\)\)\.length\(\);/);
  assert.match(src, /\{tr\("Fit"\)\}<\/button>\{\/\* #567[^}]*\*\/\}\r?\n\s*<ViewVeSelect figureOverlay=\{figureOverlay\} setFigureOverlay=\{setFigureOverlay\} \/>/);
  const sel = fs.readFileSync(new URL("../src/modules/viewer/ViewVeSelect.jsx", import.meta.url), "utf8");
  assert.match(sel, /onChange=\{\(e\) => setFigureOverlay\(\(f\) => \(\{ \.\.\.f, ve: Number\(e\.target\.value\) \}\)\)\}/);
  assert.match(sel, /VE_CHOICES\.map\(\(v\) => <option key=\{v\} value=\{v\}>\{tr\("VE \{n\}x", \{ n: v \}\)\}<\/option>\)/);
  assert.match(sel, /aria-label=\{tr\("Vertical exaggeration"\)\}/);
});
