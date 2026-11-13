// TASKS.csv #2811 (split from #2684) — the 3D View's import offers 'Local mine grid (no CRS)' as the collars' Source CRS and as the 'Grid of' a survey /
// structure file's azimuths: collars read on the mine grid go through its tie into the project CRS (a per-row EPSG still wins), a grid azimuth is
// turned by the grid's rotation, and 'mine' is never adopted, reprojected from or taken for a CRS. Synthetic grid only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tieFromOrigin } from "../src/lib/localGridTie.js";
import { collarsOnMineGrid, mineToProject } from "../src/lib/mineGrid.js";

const tie = tieFromOrigin({ lx: 10000, ly: 20000, wx: 413000, wy: 6251000, rotationDeg: 30, scale: 1, epsg: 28350 });
const project = { epsg: 28350, crsSet: true, mineGrid: { name: "SYN", tie } };

test("collars on the mine grid come into the project CRS through its tie; grid azimuths lose the grid's rotation", () => {
  const rows = [{ hole_id: "A", x: 10000, y: 20000, azimuth: 45 }, { hole_id: "B", x: 10100, y: 20000, azimuth: 10 }, { hole_id: "C", x: 500000, y: 7000000, azimuth: 90, _rowEpsg: "28350" }];
  const r = collarsOnMineGrid(rows, project);
  assert.equal(r.moved, 2);
  assert.equal(r.turned, 2);
  assert.ok(Math.abs(rows[0].x - 413000) < 1e-6 && Math.abs(rows[0].y - 6251000) < 1e-6, "the tie's origin");
  const [ex, ey] = mineToProject({ name: "SYN", tie }, 28350)(10100, 20000);
  assert.ok(Math.abs(rows[1].x - ex) < 1e-6 && Math.abs(rows[1].y - ey) < 1e-6);
  assert.ok(Math.abs(Math.hypot(rows[1].x - 413000, rows[1].y - 6251000) - 100) < 1e-6, "100 m on the grid is 100 m in the CRS (scale 1)");
  assert.deepEqual([rows[0].azimuth, rows[1].azimuth], [15, 340]);
  assert.deepEqual([rows[2].x, rows[2].y, rows[2].azimuth], [500000, 7000000, 90], "a per-row EPSG wins: left for the reprojection");
  assert.match(r.note, /^ Read on the project's mine grid \(SYN\) \(the Source CRS you set\) and brought into EPSG:28350 through its tie\. 2 grid azimuth\(s\) turned from the mine grid's north to the project grid \(-30\.00°\)\.$/);
  const t = [{ x: 10000, y: 20000, azimuth: 45 }];
  collarsOnMineGrid(t, project, { gridAzimuths: false });
  assert.equal(t[0].azimuth, 45, "true / magnetic azimuths are converted later, from the project CRS");
});

test("a project with no CRS keeps the numbers; a CRS project with no mine grid keeps them and says so", () => {
  const local = [{ x: 10000, y: 20000, azimuth: 45 }];
  const r1 = collarsOnMineGrid(local, { epsg: 3156, crsSet: false, localGrid: { name: "Pit grid" } });
  assert.deepEqual(local[0], { x: 10000, y: 20000, azimuth: 45 });
  assert.match(r1.note, /read as the local grid "Pit grid"/i);
  const none = [{ x: 10000, y: 20000 }];
  const r2 = collarsOnMineGrid(none, { epsg: 28350, crsSet: true });
  assert.equal(r2.moved, 0);
  assert.match(r2.note, /no mine grid to read it on/);
});

test("the dialog offers the mine grid for collars and for 'Grid of'; the import never adopts or reprojects from 'mine'", () => {
  const d = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(d, /mineGrid=\{modal\.target === "collars" \? mineSourceOf\(storeProject\) : null/);
  assert.match(d, /label=\{tr\("Grid of"\)\}[\s\S]{0,200}mineGrid=\{mineSourceOf\(storeProject\)/);
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /const mineSrc = isMineSource\(sourceEpsg\), srcEpsg = mineSrc \? "" : sourceEpsg;/);
  assert.match(p, /const declaredEpsg = rowCodes\.length === 1 && \(!srcEpsg/, "the CRS adopted when nothing is loaded is never 'mine'");
  assert.match(p, /if \(mineSrc\) mineNote = collarsOnMineGrid\(rows, liveProject/);
  assert.equal((p.match(/if \(mineSrc && !r\._rowEpsg\) return; \/\/ #2811/g) || []).length, 2, "both reprojection passes leave the mine-grid rows alone");
  assert.match(p, /importModal\.sourceEpsg && !isMineSource\(importModal\.sourceEpsg\)/, "the local-grid transform check does not take 'mine' for a CRS");
  assert.match(p, /if \(target !== "collars" && isMineSource\(azimuthGridEpsg\)\) \{/);
});
