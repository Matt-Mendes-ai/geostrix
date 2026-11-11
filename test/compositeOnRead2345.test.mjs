// TASKS.csv #2345 — very large tables: composite on import as an explicit option in the column chooser (never by default), the rows
// composited as they are read
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeCompositor } from "../src/lib/compositeOnRead.js";
import { parseTableText, compositeNote } from "../src/lib/tabular.js";
import { compositeShare } from "../src/lib/tableSubsetRequest.js";

const CSV = "Hole,From,To,Cu,Lith,Junk\nA,0,1,1,BAS,x\nA,1,2,3,BAS,y\nA,2,2.5,10,AND,z\nA,2.5,3,<0.01,AND,w\nB,0,3,2,X,q\nA,3,5,0,AND,r\n";

test("length-weighted means, the text over most of the length, a hole's last partial composite", () => {
  const c = makeCompositor({ hole: "H", from: "F", to: "T", lengthM: 2 });
  [{ H: "A", F: 0, T: 1, Cu: 1, L: "BAS" }, { H: "A", F: 1, T: 3, Cu: 4, L: "AND" }, { H: "A", F: 3, T: 3.5, Cu: 8, L: "AND" }].forEach(c.add);
  const { rows, stats } = c.finish();
  assert.deepEqual(rows.map((r) => [r.F, r.T]), [[0, 2], [2, 3.5]]); // the last one stops at 3.5
  assert.equal(rows[0].Cu, (1 * 1 + 4 * 1) / 2);
  assert.equal(rows[1].Cu, (4 * 1 + 8 * 0.5) / 1.5);
  assert.equal(rows[0].L, "BAS"); // a tie (1 m each): the value read first keeps it
  assert.equal(rows[1].L, "AND");
  assert.equal(stats.composites, 2);
  assert.throws(() => makeCompositor({ hole: "H", from: "F", to: "T", lengthM: 0 }));
});

test("read with the composite: only the kept columns, text in a numeric column left out and counted, unsorted holes said", () => {
  const o = parseTableText(CSV, { keep: ["Hole", "Cu", "Lith"], composite: { hole: "Hole", from: "From", to: "To", lengthM: 2 } });
  assert.deepEqual(o.headers, ["Hole", "From", "To", "Cu", "Lith"]); // From / To read although not ticked
  assert.equal(o.rows.length, 5);
  assert.ok(Math.abs(o.rows[1].Cu - 10 / 3) < 1e-12); // (10 x 0.5 + 0 x 1) / 1.5: '<0.01' is not a number
  assert.equal(o.composited.textInNumeric, 1);
  assert.deepEqual(o.composited.notTogether, ["A"]);
  assert.ok(!("Junk" in o.rows[0]));
  const note = compositeNote(o.composited);
  assert.match(note, /^Composited to 2 m as the file was read: 6 interval\(s\) of 2 hole\(s\) became 5 composite\(s\)/);
  assert.match(note, /1 text value\(s\) in numeric columns/);
  assert.match(note, /1 hole\(s\) had rows in more than one place in the file \(A\)/);
  // no composite option: the rows as they are
  assert.equal(parseTableText(CSV, { keep: ["Hole", "Cu"] }).rows.length, 6);
});

test("many composites come back whole (the live run's 150,000 overflowed the stack through push(...rows))", () => {
  const lines = ["Hole,From,To,Cu"];
  for (let h = 0; h < 300; h++) for (let k = 0; k < 700; k++) lines.push(`H${h},${k * 10},${k * 10 + 10},${k % 9}`);
  const o = parseTableText(lines.join("\n"), { keep: ["Hole", "Cu"], composite: { hole: "Hole", from: "From", to: "To", lengthM: 10 } });
  assert.equal(o.rows.length, 210000);
  assert.equal(o.composited.composites, 210000);
});

test("the chooser's estimate: the first rows' mean interval over the length", () => {
  const pv = { headers: ["Hole", "From", "To"], sample: [["A", "0", "0.5"], ["A", "0.5", "1"], ["A", "1", "1.5"]] };
  const s = compositeShare(pv, "From", "To", 2);
  assert.equal(s.meanM, 0.5); assert.equal(s.share, 0.25);
  assert.equal(compositeShare(pv, "From", "To", 0.25).share, 1);
  assert.equal(compositeShare(pv, "X", "To", 2).seen, 0);
});

test("never by default: the chooser starts unticked with no length, and passes the composite only when ticked", () => {
  const m = readFileSync(new URL("../src/components/TableColumnsModal.jsx", import.meta.url), "utf8");
  assert.match(m, /useState\(\(\) => \(\{ on: false, lengthM: ""/);
  assert.match(m, /\.\.\.\(comp\.on && compOk \? \{ composite: \{ hole: holeCol, from: comp\.from, to: comp\.to, lengthM: Number\(comp\.lengthM\) \} \} : \{\}\)/);
  const t = readFileSync(new URL("../src/lib/tabular.js", import.meta.url), "utf8");
  assert.match(t, /if \(ok\.composite\?\.lengthM > 0 && ok\.composite\.hole && ok\.composite\.from && ok\.composite\.to\) opts = /);
  const w = readFileSync(new URL("../src/lib/tabular.worker.js", import.meta.url), "utf8");
  assert.match(w, /opts\.columnar && !opts\.composite/);
});
