// TASKS.csv #3690 — 'year >= 2017' and 'prospect=Tom West' find holes; the 'has' picks carry the layer's name.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tidyFilter, holesForFilter } from "../src/lib/holeFilter.js";

const collars = [
  { hole_id: "TW-001", attrs: { year: 2018, prospect: "Tom West" } },
  { hole_id: "TW-002", attrs: { year: 2016, prospect: "Tom West" } },
  { hole_id: "JM-001", attrs: { year: 2020, prospect: "Jason Main" } },
];
const ids = (f) => holesForFilter(collars, f).holes.map((c) => c.hole_id);

test("tidyFilter: spaces around operators go, a field's value of plain words is joined", () => {
  assert.equal(tidyFilter("year >= 2017"), "year>=2017");
  assert.equal(tidyFilter("year = 2017 .. 2023"), "year=2017..2023");
  assert.equal(tidyFilter("prospect = Tom West"), "prospect=Tom_West");
  assert.equal(tidyFilter("prospect=Tom West, TW-001"), "prospect=Tom_West,TW-001");
  assert.equal(tidyFilter("prospect=Tom West TW-001"), "prospect=Tom_West TW-001", "an id (digit, dash) ends the value");
  assert.equal(tidyFilter("prospect=Tom West year>=2017"), "prospect=Tom_West year>=2017");
  assert.equal(tidyFilter("has:assays no:sg"), "has:assays no:sg");
  assert.equal(tidyFilter(""), "");
  assert.equal(tidyFilter("TW JM"), "TW JM");
});

test("the Holes list reads them", () => {
  assert.deepEqual(ids("year>=2017"), ["TW-001", "JM-001"]);
  assert.deepEqual(ids("year >= 2017"), ["TW-001", "JM-001"]);
  assert.deepEqual(ids("year = 2016 .. 2018"), ["TW-001", "TW-002"]);
  assert.deepEqual(ids("prospect=Tom West"), ["TW-001", "TW-002"]);
  assert.deepEqual(ids("prospect = Tom West year >= 2017"), ["TW-001"]);
  assert.deepEqual(ids("prospect=Tom_West"), ["TW-001", "TW-002"]);
  assert.deepEqual(ids("TW-001"), ["TW-001"]);
});

test("the 'has' menu names the layer, not its key", () => {
  const src = readFileSync(new URL("../src/modules/viewer/HoleFilterBar.jsx", import.meta.url), "utf8");
  assert.match(src, /LAYER_META\[k\.replace\(\/ \/g, "_"\)\]\?\.label \|\| k/);
  assert.match(src, /tr\("Holes with \{what\}", \{ what \}\)/);
});
