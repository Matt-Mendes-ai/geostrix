// TASKS.csv #1254 strip log lanes; #1194 how far a contact extends; #1191 the top of overburden; #1178 the block model's name
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fillLanes } from "../src/lib/stripLanes.js";
import { extendColumns, EXTEND_MIN_COVER } from "../src/lib/surfaceSolids.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1254 co-occurring minerals get their own lanes; end to end is one", () => {
  const r = fillLanes([{ from: 43.5, to: 110, value: "Py" }, { from: 43.5, to: 110, value: "Ccp" }, { from: 110, to: 120, value: "Py" }]);
  assert.equal(r.lanes, 2);
  assert.deepEqual(r.rows.map((x) => x.lane), [0, 1, 0], "the third reuses a free lane");
  assert.equal(fillLanes([{ from: 0, to: 1, value: "A" }, { from: 1, to: 2, value: "B" }]).lanes, 1);
  assert.equal(fillLanes([]).lanes, 1);
});

test("#1194 extension stops at its limit and leaves the rest empty", () => {
  const nx = 20, ny = 1, z = new Float64Array(nx).fill(NaN);
  z[0] = z[1] = 100;
  const capped = extendColumns(z, nx, ny, 5, 3);
  assert.ok(capped[4] === capped[4], "within the limit");
  assert.ok(capped[6] !== capped[6], "past it");
  const all = extendColumns(z, nx, ny);
  assert.ok(all[19] === all[19], "no limit: the box, as before");
  assert.equal(EXTEND_MIN_COVER, 0.05);
});

test("#1191 #1178 labels", () => {
  assert.match(read("src/modules/viewer/modellingRuns.js"), /spec\.label = `\$\{spec\.label\} \(ground\)`/);
  assert.match(read("src/modules/GeophysicsModule.jsx"), /overflowWrap: "anywhere"[^\n]*\{model\.name\}/);
});
