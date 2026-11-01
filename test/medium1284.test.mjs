// TASKS.csv #1284, #1174 kept panel state; #1186, #1278 Isocon's list; #1189 too few contacts; #1176 the Geophysics headline
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { keptIn, scopeOf } from "../src/lib/keptState.js";
import { tooFewContacts } from "../src/lib/viewer/contactFit.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1284 kept state is per project, and old projects are forgotten", () => {
  keptIn(scopeOf({ tabId: "t1", seq: 1 })).set("k", 5);
  assert.equal(keptIn("t1:1").get("k"), 5);
  assert.equal(keptIn("t1:2").has("k"), false, "a new project in that tab starts clean");
  for (let i = 0; i < 9; i++) keptIn(`other:${i}`);
  assert.equal(keptIn("t1:1").has("k"), false, "past the limit the oldest goes");
});

test("#1284 Geochem's diagram, colours and filter survive a tab switch", () => {
  const src = read("src/modules/GeochemModule.jsx");
  for (const k of ["diagramId", "colorMode", "lithFilter", "colorElement"]) assert.match(src, new RegExp(`\\[${k}, set\\w+\\] = useKeptState\\(`), k);
});

test("#1174 the inversion form and the DC/IP result survive a tab switch; a running job and its plan do not pretend to", () => {
  const inv = read("src/components/InversionPanel.jsx");
  for (const k of ["method", "confirmed", "zMode", "field", "unc", "mesh"]) assert.match(inv, new RegExp(`\\[${k}, set\\w+\\] = useKeptState\\(`), k);
  assert.match(inv, /\[job, setJob\] = useState\(/);
  const dc = read("src/components/DcipPanel.jsx");
  for (const k of ["line", "opts", "last", "pick"]) assert.match(dc, new RegExp(`\\[${k}, set\\w+\\] = useKeptState\\(`), k);
});

test("#1186 #1278 Isocon renders a window of its intervals, not all of them", () => {
  const src = read("src/components/IsoconTool.jsx");
  assert.match(src, /useVirtualRows\(rows\.length, INTERVAL_ROW_H/);
  assert.match(src, /rows\.slice\(startIndex, endIndex\)\.map/);
  assert.doesNotMatch(src, /\{rows\.map\(\(\{ a, id \}\)/);
});

test("#1189 too few contacts to shape a surface", () => {
  const P = (x, y, z) => ({ x, y, z });
  assert.equal(tooFewContacts([P(0, 0, 0)]), true, "one point");
  assert.equal(tooFewContacts([P(0, 0, 0), P(100, 0, 0)]), true, "two points");
  assert.equal(tooFewContacts([P(0, 0, 0), P(100, 0, 0), P(200, 0, 0), P(300, 0, 0.1)]), true, "in a line");
  assert.equal(tooFewContacts([P(0, 0, 0), P(100, 0, 0), P(0, 100, 0)]), false, "a triangle fixes a plane");
  const run = read("src/modules/viewer/modellingRuns.js");
  assert.match(run, /tooFewContacts\(s\.points\)/);
  assert.ok(run.includes("Math.round(loggedMetres.get(v.name) ?? 1) === 0"), "no volume for a unit with no logged metres");
});

test("#1176 the Geophysics headline counts block models and DC/IP lines", () => {
  const src = read("src/modules/GeophysicsModule.jsx");
  assert.match(src, /voxelModels\.length\) parts\.push/);
  assert.match(src, /dcipLines\.length\) parts\.push/);
});
