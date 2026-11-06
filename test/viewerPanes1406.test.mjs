// TASKS.csv #1406 — a ribbon pane opened at the top of a scrolled sidebar, out of sight; #1405 — the 3D grid walls stood 1,000 m above the
// origin (the mean collar elevation) while the drilling is below it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("#1406: opening a pane scrolls the sidebar to it, after toolPane is declared", () => {
  assert.ok(v.includes('<div className="ge-panel" ref={panelScrollRef}'));
  const decl = v.indexOf("const [toolPane, setToolPane]"), eff = v.indexOf("if (toolPane || interpretOpen) panelScrollRef.current?.scrollTo?.({ top: 0 });");
  assert.ok(decl > 0 && eff > decl);
});

test("#1405: the walls hang below the ground grid, as deep as the drilling", () => {
  assert.ok(v.includes("back.position.set(0, -h / 2, -size / 2);") && v.includes("side.position.set(-size / 2, -h / 2, 0);"));
  assert.ok(v.includes("buildGridGroup(gridConfig, drillDepthBelowOrigin(collars))") && v.includes("}, [gridConfig, collars]);"));
});

test("#1405: the depth estimate and the wall height", async () => {
  const { drillDepthBelowOrigin, gridWallHeight } = await import("../src/lib/viewer/gridDepth.js");
  // two collars at 1000 and 1200 m (mean 1100); a 1300 m hole at -70 from the lower one ends 1221.6 m below it -> 1321.6 m below the mean
  const d = drillDepthBelowOrigin([{ z: 1000, length: 1300, dip: -70 }, { z: 1200, length: 200, dip: -90 }]);
  assert.ok(Math.abs(d - (100 + 1300 * Math.sin(70 * Math.PI / 180))) < 1e-6, String(d));
  assert.equal(drillDepthBelowOrigin([]), 0);
  assert.equal(gridWallHeight(1000, 20, 400), 1000); // shallower than the grid: the grid's size
  assert.equal(gridWallHeight(1000, 20, 1321.6), 1350); // deeper: whole 50 m cells
});
