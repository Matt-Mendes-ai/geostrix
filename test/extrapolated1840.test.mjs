// TASKS.csv #1840 — solids from hand-picked surfaces say when those are mostly extrapolation; picks on a block model carry its value
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extrapolatedInputs, extrapolationNotice } from "../src/lib/extrapolatedInputs.js";

const top = { name: "Top of chargeability high", type: "explicit_surface", params: { extrapolatedPct: 93.6, picks: 4, sectionLines: 0, furthestFromInputM: 1210 } };
const base = { name: "Base of chargeability high", type: "explicit_surface", params: { extrapolatedPct: 97, picks: 3, sectionLines: 0 } };
const good = { name: "Well picked", type: "explicit_surface", params: { extrapolatedPct: 12, picks: 60, sectionLines: 4 } };
const pit = { name: "Pit", type: "pit_shell", params: {} };

test("only explicit surfaces mostly beyond their inputs are named", () => {
  const l = extrapolatedInputs([top, good, pit, base, null]);
  assert.deepEqual(l.map((s) => s.name), ["Top of chargeability high", "Base of chargeability high"]);
  assert.equal(l[0].pct, 94); assert.equal(l[0].picks, 4); assert.equal(l[0].furthestM, 1210); assert.equal(l[1].furthestM, null);
});

test("the warning names each input with its picks and share, and is a warning", () => {
  const n = extrapolationNotice([top, base]);
  assert.equal(n.level, "error");
  assert.match(n.text, /Mostly extrapolation/);
  assert.match(n.text, /"Top of chargeability high" is 94% beyond its 4 pick\(s\) and 0 section line\(s\) \(up to 1210 m from the nearest\)/);
  assert.match(n.text, /"Base of chargeability high" is 97% beyond its 3 pick\(s\)/);
  assert.equal(extrapolationNotice([good, pit]), null);
  assert.equal(extrapolationNotice([]), null);
});

test("wired into the vein solid, the solid blocks and the pick", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("extrapolationNotice([hw, fw])"));
  assert.ok(v.includes("extrapolationNotice(implicitSurfaces.filter((s) => lb.source?.ids?.includes(s.id)))"));
  const e = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8");
  assert.ok(e.includes("onModel: { model: m.name"));
  assert.ok(e.includes("voxelCellAt(m, e + d.x * step, n - d.z * step, z + d.y * step)"));
});
