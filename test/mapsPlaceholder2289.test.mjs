// TASKS.csv #2289 / #2290 / #2292 (review #2174, WA gold) — Maps never presents the placeholder as the project's CRS, never moves a layer
// into it, and Spectral index asks for the CRS first like the other online tools
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
test("#2289 the Project CRS main area and the raster / boundary help", () => {
  const c = read("src/modules/CartographyModule.jsx");
  assert.match(c, /\{project\.crsSet === false \? \(/);
  assert.match(c, /Coordinate system not chosen yet/);
  const r = read("src/modules/RasterModule.jsx");
  assert.match(r, /defaultText=\{project\?\.crsSet === false \? tr\("The project CRS — not chosen yet"\)/);
  assert.ok((r.match(/project\?\.crsSet === false \? tr\("not chosen yet"\)/g) || []).length >= 1);
});
test("#2290 A layer: no move into the placeholder", () => {
  const c = read("src/modules/CartographyModule.jsx");
  assert.match(c, /if \(project\?\.crsSet === false\) throw new Error\(tr\("The project's coordinate system is not chosen yet, so there is no CRS to reproject a layer into/);
  assert.ok(c.indexOf("{project.crsSet === false ? ( /* TASKS.csv #2290") > 0);
});
test("#2292 Spectral index is gated like Satellite", () => {
  const r = read("src/modules/RasterModule.jsx");
  const i = r.indexOf("const openSpectral = async () => {");
  assert.ok(i > 0 && r.slice(i, i + 600).includes("if (project?.crsSet === false) {") && r.slice(i, i + 600).includes("ensureProjectCrs(project"));
});

test("#2289 the pane's picker does not open on the placeholder, and no picker pins it", () => {
  assert.match(read("src/modules/CartographyModule.jsx"), /value=\{newCrs \|\| \(project\.crsSet === false \? null : project\.epsg\)/);
  assert.match(read("src/components/CrsPicker.jsx"), /\[crsSet \? projectEpsg : null/);
});
