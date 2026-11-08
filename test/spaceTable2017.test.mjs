// TASKS.csv #2017 (review #2013, Import) — a whitespace-aligned table (a contractor's n = 1 IP file) came in as one column.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTableText, spaceTableToTabs } from "../src/lib/tabular.js";

const N1 = [
  "   LINE      STN     GRID_X      GRID_Y     MX     RHO",
  "  3050E  1475.00  613048.50  5781472.50   7.43   162.4",
  "  3050E  1575.00  613048.50  5781568.00  13.12   189.2",
  "  3050E  1700.00  613049.00  5781685.00   7.36   214.5",
].join("\r\n");

test("a space-aligned n = 1 file reads as its six columns, with a note", () => {
  const r = parseTableText(N1);
  assert.deepEqual(r.headers, ["LINE", "STN", "GRID_X", "GRID_Y", "MX", "RHO"]);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows[1], { LINE: "3050E", STN: 1575, GRID_X: 613048.5, GRID_Y: 5781568, MX: 13.12, RHO: 189.2 });
  assert.match(r.note, /Read as a space-separated table \(6 columns\)\./);
});
test("comma, semicolon, tab and quoted files are left to the usual reader", () => {
  assert.equal(spaceTableToTabs("a,b,c\n1,2,3"), null);
  assert.equal(spaceTableToTabs("a;b;c\n1;2;3"), null);
  assert.equal(spaceTableToTabs("a\tb\tc\n1\t2\t3"), null);
  assert.equal(spaceTableToTabs('name x y\n"Great Plains" 1 2'), null); // a quoted name with a space: never guessed
  assert.equal(spaceTableToTabs("Hole Easting\nA 1"), null); // fewer than 3 fields
  assert.equal(spaceTableToTabs("a b c\nfree text line that is long\nmore words here and there ok"), null); // the lines do not agree
  const csv = parseTableText("hole,x,y\nA,1,2");
  assert.deepEqual(csv.headers, ["hole", "x", "y"]);
  assert.doesNotMatch(csv.note, /space-separated/);
});
