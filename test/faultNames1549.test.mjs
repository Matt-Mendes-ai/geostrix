// TASKS.csv #1549 — Lawyers' fault zones (fz-gc, fz-gr, fz-bx, fz-br, fz-sl) were not 'Named as faults' in the fault picker
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { faultLikeName } from "../src/lib/layers.js";

test("fault vocabulary as whole tokens", () => {
  for (const t of ["fz-gc", "fz-gr", "fz-bx", "fz-br", "fz-sl", "FLT", "Fault", "Fault zone", "SH", "shz", "Shearzone", "gouge", "Main Fault 2", "x fz"]) assert.equal(faultLikeName(t), true, t);
  for (const t of ["Vn1a", "Vn3", "bedding", "ct", "VnMS", "fractures", "shale", "SHL", "fzx", "", null]) assert.equal(faultLikeName(t), false, String(t));
});

test("the fault picker uses it", () => {
  const s = readFileSync(new URL("../src/modules/viewer/useModelling.js", import.meta.url), "utf8");
  assert.match(s, /faultLike: faultLikeName\(`\$\{s\.value\} \$\{s\.structure_id \|\| ""\}`\)/);
});
