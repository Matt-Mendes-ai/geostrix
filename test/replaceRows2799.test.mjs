// TASKS.csv #2799 — replaceRowsByHole's identical-hole check compares values, not strings; the state setters skip it
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { replaceRowsByHole } from "../src/lib/layers.js";

const rows = (tag, f = (r) => r) => { const out = []; for (let h = 0; h < 5; h++) for (let i = 0; i < 4; i++) out.push(f({ hole_id: `H${h}`, from: i, to: i + 1, value: ["A", "B"][i % 2], extra: null, obj: { a: [1, 2] }, _src: tag })); return out; };

test("identical holes are found whatever the row or key order and the internal _ fields; a changed value is a replaced hole", () => {
  const prev = rows("a.csv");
  const same = rows("b.csv").reverse().map((r) => Object.fromEntries(Object.entries(r).reverse())); // other row and key order
  const r = replaceRowsByHole(prev, same);
  assert.deepEqual(r.identicalHoles.sort(), ["H0", "H1", "H2", "H3", "H4"]);
  assert.deepEqual(r.replacedHoles, []);
  const changed = rows("b.csv", (x) => (x.hole_id === "H2" && x.from === 2 ? { ...x, value: "Z" } : x));
  const c = replaceRowsByHole(prev, changed);
  assert.deepEqual(c.replacedHoles, ["H2"]); assert.equal(c.identicalHoles.length, 4);
  const obj = replaceRowsByHole(prev, rows("b.csv", (x) => (x.hole_id === "H1" && x.from === 0 ? { ...x, obj: { a: [1, 3] } } : x)));
  assert.deepEqual(obj.replacedHoles, ["H1"]);
  const fewer = replaceRowsByHole(prev, rows("b.csv").filter((x) => !(x.hole_id === "H4" && x.from === 3)));
  assert.ok(fewer.replacedHoles.includes("H4") && !fewer.identicalHoles.includes("H4"));
  const nan = (v) => rows(v, (x) => ({ ...x, extra: NaN }));
  assert.equal(replaceRowsByHole(nan("a"), nan("b")).identicalHoles.length, 5);
});

test("rows at the same depth fall back to the signature compare; identical: false returns the same rows without the check", () => {
  const tied = (v) => [{ hole_id: "T", depth: 5, value: "x", _src: v }, { hole_id: "T", depth: 5, value: "y", _src: v }];
  assert.deepEqual(replaceRowsByHole(tied("a"), tied("b").reverse()).identicalHoles, ["T"]);
  assert.deepEqual(replaceRowsByHole(tied("a"), [{ hole_id: "T", depth: 5, value: "x" }, { hole_id: "T", depth: 5, value: "z" }]).identicalHoles, []);
  const prev = rows("a.csv"), inc = rows("b.csv");
  const full = replaceRowsByHole(prev, inc), lean = replaceRowsByHole(prev, inc, null, { identical: false });
  assert.deepEqual(lean.rows, full.rows); assert.deepEqual(lean.identicalHoles, []);
});

test("the import's setters ask for the rows only; the notice's call keeps the check", () => {
  const p = fs.readFileSync("src/modules/viewer/importPipelineImpl.js", "utf8");
  assert.equal(p.split("{ identical: false })").length - 1, 4);
  assert.equal((p.match(/const replaced = replaceRowsByHole\(/g) || []).length, 3);
});
