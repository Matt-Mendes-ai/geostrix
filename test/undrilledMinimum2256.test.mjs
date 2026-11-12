// TASKS.csv #2256 — with 'Ignore gaps under' blank, gaps of fewer than 8 blocks are not offered as drill targets
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { undrilledZones } from "../src/lib/undrilledZones.js";

function box(x0, x1, y0, y1, z0, z1) {
  const positions = new Float64Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]);
  return { positions, indices };
}
const vertical = (x, y) => [{ x, y, z: 100 }, { x, y, z: -100 }];

test("a 2-block gap goes under the 8-block default; a typed 0 keeps it; the volume used is returned", () => {
  // a bar of 2.5 m blocks, 30 m long and one block square; the two holes leave a gap of a few blocks at its far end
  const unit = box(0, 30, 0, 2.5, 0, 2.5);
  const traces = [vertical(5, 1.25), vertical(17, 1.25)];
  const base = { solid: unit, traces, coverM: 8, cellM: 2.5 };
  const keep = undrilledZones({ ...base, minZoneM3: 0, minZoneBlocks: 8 });
  assert.equal(keep.zones.length, 1);
  assert.ok(keep.zones[0].cells < 8, String(keep.zones[0].cells));
  assert.equal(keep.minZoneM3, 0);
  const dflt = undrilledZones({ ...base, minZoneM3: null, minZoneBlocks: 8 });
  assert.equal(dflt.zones.length, 0);
  assert.equal(dflt.ignored.zones, 1);
  assert.equal(dflt.minZoneM3, 8 * 2.5 ** 3);
  // a direct caller with no option keeps every gap, as before
  assert.equal(undrilledZones(base).zones.length, 1);
});

test("the pane: blank means 8 blocks, said in the placeholder and the left-out line, and in the saved record", () => {
  const p = fs.readFileSync("src/components/UndrilledZonesPane.jsx", "utf8");
  assert.match(p, /const MIN_ZONE_BLOCKS = 8;/);
  assert.match(p, /minZoneM3: minText === "" \? null : Number\(minText\) \|\| 0, minZoneBlocks: MIN_ZONE_BLOCKS/);
  assert.match(p, /tr\("\{n\} blocks: \{v\}"/);
  assert.match(p, /"\{n\} gaps under \{m\} \(\{v\}\) left out\."/);
  assert.match(p, /smallGapUnderM3: Math\.round\(r\.minZoneM3 \?\? 0\)/);
  assert.ok(p.indexOf("const autoCell = useMemo(") < p.indexOf("const minAuto = useMemo(")); // no temporal dead zone
});
