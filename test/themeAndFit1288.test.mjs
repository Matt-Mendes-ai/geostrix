import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wrapText } from "../src/lib/figureFurniture.js";

const read = (f) => readFileSync(f, "utf8");
const viewer = read("src/modules/ViewerModule.jsx");
test("#1181 Fit frames the holes, the full extent stays on the menu", () => {
  assert.match(viewer, /<button onClick=\{\(\) => zoomToHoles\(\)\}/);
  assert.match(viewer, /zoomToHoles = \(\) => autoFitInitial\(lastTracesRef\.current, lastHoleTraceCountRef\.current\)/);
  assert.equal(viewer.split('label={tr("Zoom to fit all")}').length - 1, 2);
});
test("#1287 one writer of viewerUiState", () => {
  assert.equal(viewer.split("setViewerUiState({").length - 1, 1);
  assert.ok(!viewer.includes("restoreLiveView"));
});
test("#1288 a theme carries the four settings, in all three places", () => {
  for (const key of ["setBgColor(theme.bgColor)", "setHoleLabelMode(theme.holeLabelMode)", "setFigureOverlay({ ...DEFAULT_FIGURE_OVERLAY, ...theme.figureOverlay })"]) assert.ok(viewer.includes(key), key);
  assert.match(viewer, /JSON\.stringify\(p\) === JSON\.stringify\(theme\.layerStyles\) \? p : theme\.layerStyles/);
  assert.match(viewer, /bgColor, holeLabelMode, figureOverlay, layerStyles, \/\/ TASKS\.csv #1288/);
  assert.match(viewer, /bgColor: s\?\.bgColor \|\| DEFAULT_BG_COLOR, holeLabelMode: s\?\.holeLabelMode/);
});
test("#1241 the pin points down the dip", async () => {
  const THREE = await import("three");
  const toRad = (d) => (d * Math.PI) / 180;
  for (const [dip, az] of [[60, 45], [60, 225], [30, 0], [90, 120]]) {
    const dir = new THREE.Vector3(Math.sin(toRad(az)) * Math.cos(toRad(dip)), -Math.sin(toRad(dip)), -Math.cos(toRad(az)) * Math.cos(toRad(dip)));
    assert.ok(Math.abs(dir.length() - 1) < 1e-9);
    assert.ok(dir.y < 0); // downward
    const pin = new THREE.Object3D();
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(pin.quaternion);
    assert.ok(tip.distanceTo(dir) < 1e-9);
    // in the disc's plane: the same rotation the disc gets
    const disc = new THREE.Object3D();
    disc.rotation.order = "YXZ"; disc.rotation.x = Math.PI / 2 - toRad(dip); disc.rotation.y = -toRad(az);
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(disc.rotation);
    assert.ok(Math.abs(normal.dot(dir)) < 1e-9, `${dip}/${az}`);
    // and on the dip-direction side: east and north components follow the azimuth
    if (dip < 90) { assert.ok(Math.abs(dir.x - Math.sin(toRad(az)) * Math.cos(toRad(dip))) < 1e-9); assert.ok(Math.abs(-dir.z - Math.cos(toRad(az)) * Math.cos(toRad(dip))) < 1e-9); }
  }
});
test("#1256 a long subtitle wraps to the plot width at the largest text size", () => {
  const text = "Azimuth 60° · no vertical exaggeration · data within ±100 m of the line (dashed = trace projected from further away) · elevation in m";
  const W = 1100, PAD = 120, size = 20;
  const lines = wrapText(text, Math.floor((W - 2 * PAD) / (0.56 * size)));
  assert.equal(lines.length, 2);
  assert.equal(lines.join(" "), text);
  for (const l of lines) assert.ok(l.length * 0.56 * size <= W - 2 * PAD);
});
