// TASKS.csv #1687 — the model check against a trivial model, and a dip estimated from one hole's points
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelCheckBaseline, baselineNotice, oneHoleShare, oneHoleDipNotice } from "../src/lib/modelCheckBaseline.js";

test("a one-unit check at 95% does not beat calling everything that unit", () => {
  const chk = { total: 2410, matched: 2290, units: [{ unit: "Volcanic host", logged: 2410, matched: 2290 }] };
  const b = modelCheckBaseline(chk);
  assert.equal(Math.round(b.base.pct), 100); assert.equal(Math.round(b.pct), 95);
  const n = baselineNotice(chk);
  assert.equal(n.level, "error");
  assert.match(n.text, /calling every one of these logged metres Volcanic host would score 100%, so 95% does not show/);
});

test("a multi-unit model that beats the majority by a margin says nothing", () => {
  const chk = { total: 1000, matched: 900, units: [{ unit: "A", logged: 600, matched: 560 }, { unit: "B", logged: 400, matched: 340 }] };
  assert.equal(baselineNotice(chk), null);
  const close = { total: 1000, matched: 620, units: [{ unit: "A", logged: 600 }, { unit: "B", logged: 400 }] };
  assert.ok(baselineNotice(close));
  assert.equal(baselineNotice({ total: 0, matched: 0, units: [] }), null);
});

test("most contact points in one hole flag the estimated dip", () => {
  const pts = [...Array(9)].map(() => ({ hole_id: "COP-23-0001" })).concat([{ hole_id: "COP-23-0005" }, { hole_id: "COP-23-0007" }]);
  assert.deepEqual(oneHoleShare(pts), { hole: "COP-23-0001", k: 9, n: 11 });
  assert.match(oneHoleDipNotice(pts, "Volcanic host").text, /9 of 11 "Volcanic host" contact points are in COP-23-0001/);
  assert.equal(oneHoleShare([{ hole_id: "A" }, { hole_id: "B" }, { hole_id: "C" }, { hole_id: "D" }]), null);
  assert.equal(oneHoleShare([{ hole_id: "A" }, { hole_id: "A" }]), null, "too few points to judge");
});

test("wired into the model run", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.ok(s.includes("baselineNotice(chk)") && s.includes("oneHoleDipNotice(points, unitName)"));
});
