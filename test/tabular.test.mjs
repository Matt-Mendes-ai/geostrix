// TASKS.csv #720 — "#" lines are skipped only before the header; ids such as "#1" keep their rows.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTableText, parseColumnsRaw, stripLeadingComments } from "../src/lib/tabular.js";

test("hole ids starting with # keep their rows", () => {
  const r = parseTableText("hole_id,from,to,lithology\n#1,0,10,A\n#2,0,5,B\nDDH-3,0,5,C\n");
  assert.deepEqual(r.rows.map((x) => x.hole_id), ["#1", "#2", "DDH-3"]);
});

test("GeoStrix's export stamp at the top is still skipped (CRLF, blank line before the header)", () => {
  const stamped = parseTableText("# GeoStrix 0.1.54 export\r\n# cutoff 0.5 g/t\r\n\r\nhole_id,from,to\r\nA,0,1\r\n#9,1,2\r\n");
  assert.deepEqual(stamped.headers, ["hole_id", "from", "to"]);
  assert.deepEqual(stamped.rows.map((x) => x.hole_id), ["A", "#9"]);
  assert.equal(stamped.rows[1].from, 1);
});

test("the columnar reader behaves the same", () => {
  const raw = parseColumnsRaw("# stamp\nhole_id,from,to\n#1,0,1\nB,1,2\n");
  assert.deepEqual(raw.headers, ["hole_id", "from", "to"]);
  assert.equal(raw.n, 2);
});

test("stripLeadingComments: lines before the header; a full-width # row after it is data", () => {
  assert.equal(stripLeadingComments("# a\n# b\nx,y\n").skipped, 2);
  assert.equal(stripLeadingComments("x,y\n#c,1\n").skipped, 0);
  assert.equal(stripLeadingComments("# a\nx,y\n", false).skipped, 0);
});

test("a short # note after the data is skipped; a full-width # row is kept", () => {
  const r = parseTableText("hole_id,from,to\n#1,0,1\nB,1,2\n# GeoStrix export stamp\n");
  assert.deepEqual(r.rows.map((x) => x.hole_id), ["#1", "B"]);
  assert.equal(stripLeadingComments("x,y\n1,2\n# note\n").skipped, 1);
});
