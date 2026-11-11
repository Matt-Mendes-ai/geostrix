// TASKS.csv #2559 — a 4-channel radiometric file feeds the K-eTh-eU ternary without hand-made files: the import already gives one survey
// per channel (#2395); the channel grids now keep their channel in the name, and the ternary preselects each channel's grid.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveyLabel, ternaryChoices } from "../src/lib/rasterMethod.js";
import { channelKey } from "../src/lib/radiometricChannels.js";

test("a channel survey keeps its channel in the raster name; a plain file loses only its extension", () => {
  assert.equal(surveyLabel(channelKey("rad.csv", "K_pct")), "rad · K_pct");
  assert.equal(surveyLabel(channelKey("rad.csv", "eU/eTh")), "rad · eU/eTh");
  assert.equal(surveyLabel("walk.mag.csv"), "walk.mag");
  assert.equal(surveyLabel("survey"), "survey");
});

test("the ternary marks the one grid of each channel as exact, so opening it preselects them", () => {
  const rs = [{ id: "k", name: "rad · K_pct" }, { id: "u", name: "rad · eU_ppm" }, { id: "t", name: "rad · eTh_ppm" }, { id: "m", name: "TMI" }];
  const m = { k: "rad_k", u: "rad_u", t: "rad_th", m: "mag" };
  for (const [ch, id] of [["k", "k"], ["th", "t"], ["u", "u"]]) {
    const ex = ternaryChoices(rs, ch, (r) => m[r.id]).filter((c) => c.exact);
    assert.deepEqual(ex.map((c) => c.raster.id), [id]);
  }
  const two = ternaryChoices([...rs, { id: "k2", name: "K again" }], "k", (r) => ({ ...m, k2: "rad_k" })[r.id]).filter((c) => c.exact);
  assert.equal(two.length, 2, "two K grids: nothing is preselected (the dialog picks only when exactly one)");
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(r, /return ex\.length === 1 \? ex\[0\]\.raster\.id : "";/);
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const label = surveyLabel\(idwKey\);/);
});
