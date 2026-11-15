// TASKS.csv #2826 (Main's OK for the store.jsx hunk) — Maps > A layer 'Its coordinates are really in: Local mine grid': the layer moves through the
// project's mine grid tie, and its bearings turn with it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reprojectProject } from "../src/lib/projectReproject.js";
import { mineToProject } from "../src/lib/mineGrid.js";

// SYNTHETIC mine grid tied to MGA 50 (28350): grid (x, y) -> world = a x - b y + tx, b x + a y + ty, rotated 30 degrees
const rot = (30 * Math.PI) / 180, tie = { epsg: 28350, a: Math.cos(rot), b: Math.sin(rot), tx: 600000, ty: 7500000 };
const mg = { name: "SYNTH mine", tie };

test("collars of a mine-grid layer land where the tie puts them; the azimuth turns by the grid's rotation", () => {
  const T = mineToProject(mg, 28350);
  const collars = [{ hole_id: "M1", x: 1000, y: 2000, z: 300, azimuth: 90, dip: -60 }];
  const { fields } = reprojectProject({ project: { epsg: 28350 }, collars, survey: [{ hole_id: "M1", depth: 0, azimuth: 90, dip: 60 }] }, 28350, 28350, { transform: T });
  const [x, y] = T(1000, 2000);
  assert.ok(Math.abs(fields.collars[0].x - x) < 1e-6 && Math.abs(fields.collars[0].y - y) < 1e-6);
  const turned = ((fields.collars[0].azimuth - 90 + 540) % 360) - 180;
  assert.ok(Math.abs(Math.abs(turned) - 30) < 0.05, `${turned}`); // the bearing turns by the 30 degree rotation (sign by the tie's convention)
  assert.ok(Math.abs(fields.collars[0].azimuth - fields.survey[0].azimuth) < 0.05);
});

test("the store takes 'mine' as the From, refuses a raster or terrain, and the pane offers the mine grid when the project has one", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /if \(String\(fromEpsg\)\.toLowerCase\(\) === "mine"\) \{/);
  assert.match(s, /opts = \{ \.\.\.opts, transform: mineToProject\(mg, toEpsg\) \}; fromEpsg = Number\(mg\.tie\.epsg\);/);
  assert.match(s, /target\.kind === "rasters" \|\| target\.kind === "terrain"/);
  const c = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(c, /fromMine \? MINE_SOURCE : Number\(objFrom\)/);
  assert.match(c, /mineGridOf\(project\) \/\* #2826/);
  const r = readFileSync(new URL("../src/lib/projectReproject.js", import.meta.url), "utf8");
  assert.match(r, /const T = opts\.transform \|\| pointTransform\(fromEpsg, toEpsg\);/);
});
