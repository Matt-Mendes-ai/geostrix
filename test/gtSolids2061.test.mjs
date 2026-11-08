// TASKS.csv #2061 (review #2013, Woodjam) — Grade-tonnage 'Inside the solid' offers any watertight solid (an artificially closed grade
// shell too, as the Estimation dialog does) and says when its volume is an assumption.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isMeshClosed } from "../src/lib/meshQuery.js";
const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const P = [0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1];
const I = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
test("a cube is closed, the cube missing a face is not", () => {
  assert.equal(isMeshClosed(P, I).closed, true);
  assert.equal(isMeshClosed(P, I.slice(0, -6)).closed, false); // an object, not a boolean: the first version of #2061 let every mesh through
});
test("the picker takes watertight solids whatever their closure label, and names the artificial ones", () => {
  assert.match(g, /\(s\.closure === "closed" \|\| isMeshClosed\(s\.vertices, s\.indices\)\.closed\)/);
  assert.match(g, /s\.closure === "artificial" \? ` · \$\{tr\("closed artificially"\)\}` : ""/);
  assert.match(g, /closed artificially at the search radius: its volume is an assumption/); // the export stamp
  assert.match(g, /The solid was closed artificially at the search radius, so its volume is an assumption\./); // the on-screen note
});
