// TASKS.csv #1367 / #1369 — roles apply to raw-code and group targets; the usual fault / breccia / dyke / vein / no-recovery codes are guessed
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { roleForLithology, isCrossCuttingRole, mcodeRoleOf } from "../src/lib/layers.js";
import { startsBelowNonUnit } from "../src/lib/modellingCodes.js";
import { bcSkip, bcText } from "./helpers/bcSample.mjs"; // TASKS.csv #3134 — the BC samples are not in the repository: real-data checks run where one is found

test("#1369: Silvertip's FAULT, BRX, DYK, VEIN and NRCV get roles; units and look-alikes stay stratigraphic", () => {
  const want = { FAULT: "fault", flt: "fault", Gouge: "fault", BRX: "breccia", BX: "breccia", DYK: "dyke", Dike: "dyke", VEIN: "vein", QV: "vein", NRCV: "no recovery", "core loss": "no recovery", OB: "overburden", CAS: "overburden" };
  for (const [code, role] of Object.entries(want)) assert.equal(roleForLithology(code), role, code);
  for (const code of ["LMST", "SLST", "VBX", "FAULTED LMST", "YBR", "DK2", "", null]) assert.equal(roleForLithology(code), "stratigraphic", String(code));
  assert.ok(isCrossCuttingRole("vein"));
  assert.deepEqual(["FAULT", "VEIN", "NRCV", "OB", "LMST"].map((c) => mcodeRoleOf(roleForLithology(c))), ["cross-cutting", "cross-cutting", "ignore", "overburden", "stratigraphic"]);
});

// the McDame group's tops in a log, skipping starts under the roles above (mc: a Modelling codes record or null for the guesses)
const group = new Set(["LMST", "DLST", "MSULF"]), groupOf = (v) => (group.has(v) ? "McDame carbonate" : null);
function mcdameTops(rows, mc) {
  const defaultRole = (n) => mcodeRoleOf(roleForLithology(n));
  const out = [];
  Map.groupBy(rows, (r) => r.hole_id).forEach((list) => {
    list.sort((a, b) => a.from - b.from);
    list.forEach((r, i) => {
      if (!group.has(r.lithology)) return;
      const prev = i > 0 && Math.abs(list[i - 1].to - r.from) < 1e-3 ? list[i - 1] : null;
      if (prev && group.has(prev.lithology)) return; // continues the unit
      if (startsBelowNonUnit(prev ? [prev.lithology] : [], mc, groupOf, defaultRole)) return;
      out.push({ hole: r.hole_id, md: r.from, above: prev?.lithology ?? null });
    });
  });
  return out;
}

test("#1367: tops of a carbonate group skip starts under faults, breccia, veins, dykes, no recovery and casing (synthetic log)", () => {
  const log = [["A", "OB", "LMST", "SLST", "LMST"], ["B", "SLST", "FAULT", "DLST"], ["C", "SLST", "BRX", "LMST", "VEIN", "MSULF"], ["D", "SLST", "DYK", "LMST", "NRCV", "LMST"], ["E", "SLST", "YBR", "LMST"], ["F", "SLST", "DLST"]];
  const rows = log.flatMap(([h, ...codes]) => codes.map((c, k) => ({ hole_id: h, from: 10 * k, to: 10 * k + 10, lithology: c })));
  const guessed = mcdameTops(rows, null);
  assert.deepEqual(guessed.map((t) => `${t.hole}:${t.above}`), ["A:SLST", "E:YBR", "F:SLST"]); // under OB, FAULT, BRX, VEIN, DYK, NRCV: none
  const set = mcdameTops(rows, { codes: [{ name: "YBR", role: "cross-cutting" }], assign: {} });
  assert.deepEqual(set.map((t) => `${t.hole}:${t.above}`), ["A:SLST", "F:SLST"], "a role set in Modelling codes applies to the group target");
});

test("#1367: tops of the McDame group on Silvertip skip starts under faults, breccia, veins, dykes, no recovery and casing", { skip: bcSkip("silvertip") }, () => {
  const rows = Papa.parse(bcText("silvertip", "litho.csv"), { header: true, skipEmptyLines: true }).data.map((r) => ({ ...r, from: +r.from, to: +r.to }));
  const defaultRole = (n) => mcodeRoleOf(roleForLithology(n));
  const tops = (mc) => {
    const out = [];
    const byHole = Map.groupBy(rows, (r) => r.hole_id);
    byHole.forEach((list) => {
      list.sort((a, b) => a.from - b.from);
      list.forEach((r, i) => {
        if (!group.has(r.lithology)) return;
        const prev = i > 0 && Math.abs(list[i - 1].to - r.from) < 1e-3 ? list[i - 1] : null;
        if (prev && group.has(prev.lithology)) return; // continues the unit
        if (startsBelowNonUnit(prev ? [prev.lithology] : [], mc, groupOf, defaultRole)) return;
        out.push({ hole: r.hole_id, md: r.from, above: prev?.lithology ?? null });
      });
    });
    return out;
  };
  const guessed = tops(null);
  assert.ok(!guessed.some((t) => ["FAULT", "BRX", "VEIN", "DYK", "NRCV", "OB"].includes(t.above)), JSON.stringify(guessed));
  assert.ok(guessed.some((t) => t.above === "YBR"), "YBR is this property's own code: no guess");
  const set = tops({ codes: [{ name: "YBR", role: "cross-cutting" }], assign: {} });
  assert.ok(!set.some((t) => t.above === "YBR"), "a role set in Modelling codes applies to the group target");
  assert.ok(set.length >= 6 && set.length < 27, `${set.length} tops (the group run used 27)`);
});
