// TASKS.csv #1071 (review #1016) — zero-padded ids stay text whatever the header is called; Hole_Length is not the hole id.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTableText, parseColumnsRaw } from "../src/lib/tabular.js";
import { guessMapping } from "../src/lib/layers.js";

test("#1071 a zero-padded id stays text under any header; measurements stay numbers", () => {
  for (const h of ["DDH", "Collar", "Name", "Site_ID", "Lab_ID", "Well"]) {
    const { rows } = parseTableText(`${h},x,y,z\n0045,500000,6000000,1000\n0046,500100,6000000,1001\n`);
    assert.equal(rows[0][h], "0045", h);
    assert.equal(rows[0].x, 500000, h);
  }
  const e = parseTableText("Au,depth\n1E3,10\n0.5,20\n").rows; // a grade written 1E3 stays a number
  assert.equal(e[0].Au, 1000); assert.equal(e[0].depth, 10);
  const plain = parseTableText("hole,depth,au\nA1,10.5,0.05\n").rows[0]; // nothing id-like: as before
  assert.deepEqual(plain, { hole: "A1", depth: 10.5, au: 0.05 });
});

test("#1071 the columnar path keeps them too", () => {
  const head = "DDH,from,to,Au\n";
  const body = Array.from({ length: 50 }, (_, i) => `00${10 + i},${i},${i + 1},0.${i}`).join("\n");
  const r = parseColumnsRaw(head + body);
  if (r) { const k = r.headers.indexOf("DDH"); assert.equal(r.cols[k].txt ? "text" : "number", "text"); }
});

test("#1071 dhid / ddh are hole-id aliases; Hole_Length / Hole_Depth are not guessed as the hole id", () => {
  assert.equal(guessMapping("litho", ["DHID", "from", "to", "lithology"]).hole_id, "DHID");
  assert.equal(guessMapping("collars", ["DDH", "x", "y", "z"]).hole_id, "DDH");
  assert.equal(guessMapping("collars", ["Hole_Length", "x", "y", "z"]).hole_id, "");
});
