// TASKS.csv #3582 (and Review's re-test E-1 of #3551) — the per-collar underground rule reached only the callers that pass the project's own
// collars: the pit / undrilled-zones workers got {x, y, z} alone and the pit tools no survey. A planned collar 13.8 m from the surface collars
// TS083 / TS084 (1,533.85 m) was offered 1,441.7 m because the Tom West UDDH fans (1,301-1,445 m) were the ground there.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { collarGround, collarsForGround, surfaceCollars, undergroundCollars } from "../src/lib/collarGround.js";
import { normalizeHoleType } from "../src/lib/holeType.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const table = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`).replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const collars = table("collars.csv").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, attrs: { hole_type: r.hole_type, "hole type": normalizeHoleType(r.hole_type) } }));

test("Macpass: the ground 13.8 m from TS083 / TS084 (1,533.85 m) is 1,534.2 m, not the 1,441.6 m the underground fans gave", () => {
  const s = collars.find((c) => c.hole_id === "TS083");
  assert.equal(s.z, 1533.85);
  assert.ok(Math.abs(collarGround(collars)(s.x + 13.8, s.y) - 1534.2) < 0.1);
  const untyped = collars.map((c) => ({ ...c, attrs: {} }));
  assert.ok(Math.abs(collarGround(untyped)(s.x + 13.8, s.y) - 1441.6) < 0.1, "the rehearsal's 92 m low");
});

test("collarsForGround: the 479 surface collars for the workers; a project with fewer than 3 left goes whole so the underground check still refuses it", () => {
  assert.equal(collarsForGround(collars).length, 479);
  assert.equal(collarsForGround(collars), surfaceCollars(collars));
  const allUg = collars.slice(0, 40).map((c) => ({ ...c, attrs: { hole_type: "UDDH" } }));
  assert.equal(collarsForGround(allUg), allUg);
  const none = collars.slice(0, 40);
  assert.equal(collarsForGround(none), none, "the same array when nothing is left out");
});

test("a hole that starts upward only in the survey is left out when the survey is passed (the pit tools, #3582)", () => {
  const surf = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) surf.push({ hole_id: `S${i}-${j}`, x: i * 50, y: j * 50, z: 1000 });
  const up = { hole_id: "UP1", x: 105, y: 105, z: 850 };
  const all = [...surf, up], survey = [{ hole_id: "UP1", depth: 0, azimuth: 0, dip: -20 }];
  assert.equal(undergroundCollars(all, []).ids.size, 0, "no survey: not seen");
  assert.equal(undergroundCollars(all, survey).ids.get("UP1"), "upward");
  assert.ok(Math.abs(collarGround(all, survey)(105, 105) - 1000) < 1);
  assert.ok(collarGround(all)(105, 105) < 1000, "without it the up-hole is a ground collar");
});

test("the pit, nested-pit, design and undrilled-zones panes send the ground collars; the pit tools pass the survey (source pins)", () => {
  for (const [f, re] of [
    ["../src/components/PitShellPane.jsx", /\(phases\) => setBusy\(phases\), collarsForGround\(collars, survey\), byIn,/],
    ["../src/components/PitDesignPane.jsx", /opts, terrain, collarsForGround\(collars, survey\),/],
    ["../src/components/NestedPitsPane.jsx", /terrain, collars: collarsForGround\(collars, survey\), byModel/],
    ["../src/components/UndrilledZonesPane.jsx", /\{ collars: collarsForGround\(collars, survey\) \}/],
    ["../src/lib/pitShell.js", /collarGround\(collars, survey\) : null\); \/\/ survey: #3551/],
    ["../src/lib/pitShell.js", /collarGround\(collars, survey \|\| undefined\) : null; \/\/ #1353; survey: #3582/],
    ["../src/lib/modelGround.js", /collarGround\(pts, survey\)/],
    ["../src/components/PlannedHoleParts.jsx", /collarGround\(collars, survey \|\| undefined\)/],
    ["../src/components/DesignLinesPane.jsx", /collarGround\(collars, survey\)\), \[terrain, collars, survey\]/],
  ]) assert.match(read(f), re, f);
});
