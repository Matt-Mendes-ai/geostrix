// TASKS.csv #877 — a block count's volume comes with the most it can be off by, and where the box cuts the unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { surfacesToBlock } from "../src/lib/surfaceSolids.js";
import { blockUnitStats } from "../src/lib/unitVolumes.js";
import { provenanceLines } from "../src/lib/meshExport.js";

const flat = (name, z, unit) => ({ name, unit, positions: Float64Array.from([-10, -10, z, 210, -10, z, 210, 210, z, -10, 210, z]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]) });

test("#877 a 37 m slab in 25 m blocks: the true volume lies inside the band whatever the box base", () => {
  const truth = 37 * 200 * 200;
  for (const zmin of [-12.5, -50, -100]) {
    const r = surfacesToBlock({ tops: [flat("Cover", 100, "Cover"), flat("Slab", 37, "Slab"), flat("Below", 0, "Below")], extent: [0, 200, 0, 200, zmin, 125], cell: 25 });
    const st = blockUnitStats(r.block).units.Slab;
    assert.ok(Math.abs(st.volumeM3 - truth) <= st.bandM3 + 1e-6, `zmin ${zmin}: ${st.volumeM3} vs ${truth} +/- ${st.bandM3}`);
    assert.deepEqual(st.box, ["sides"], "the slab reaches the box sides only");
  }
});

test("#877 the lowest unit is flagged as cut by the box base", () => {
  const r = surfacesToBlock({ tops: [flat("Top", 50, "Upper"), flat("Low", 0, "Lower")], extent: [0, 200, 0, 200, -100, 75], cell: 25 });
  const s = blockUnitStats(r.block);
  assert.ok(s.units.Lower.box.includes("base") && !s.units.Upper.box.includes("base"));
  assert.deepEqual(s.blockM, [25, 25, 25]);
});

test("#877 the unit-volume export states the band and the box cut", () => {
  const l = provenanceLines("Slab volume", { tool: "unit volume from the implicit model's lithology block", unit: "Slab", model: "m", builtAt: "t", cells: 128, cellVolumeM3: 15625, cellsVolumeM3: 2000000, shellVolumeM3: 2000000, volumeBandM3: 1000000, blockSizeM: [25, 25, 25], cutByBox: ["base", "sides"] }).join("\n");
  assert.match(l, /Up to \+\/- 1,000,000 m3 from the block size alone \(25 x 25 x 25 m blocks/);
  assert.match(l, /Reaches the model box base, sides: there it is cut by the box/);
  assert.ok(!/Other parameters/.test(l), l);
});
