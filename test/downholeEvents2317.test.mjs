// TASKS.csv #2317 — regolith boundary events (BOCO, TOFR, ...) at one depth per hole: read as a custom layer of depth picks, offered to the
// Explicit surface tool as one pick per hole
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { looksLikeEventTable, eventMapping, eventNotes, eventPickOptions, defaultEventOption } from "../src/lib/downholeEvents.js";
import { guessTargetFor, guessMapping } from "../src/lib/layers.js";
import { seedPicksFromTops } from "../src/lib/explicitUnits.js";

test("an event table is a custom layer of depth picks, not structures", () => {
  const h = ["HOLE_ID", "Event_Code", "Depth"];
  assert.equal(looksLikeEventTable(h), true);
  assert.equal(guessTargetFor(h, "event.csv"), "custom"); // was "structure"
  const m = guessMapping("custom", h);
  assert.equal(m.hole_id, "HOLE_ID"); assert.equal(m.depth, "Depth"); assert.equal(m.value, "Event_Code"); assert.ok(!m.from);
  assert.deepEqual(eventMapping(["Hole_ID", "Event", "Event_Depth"]), { hole_id: "Hole_ID", depth: "Event_Depth", value: "Event" });
  // a plain "Event" header and "Event_Depth": the code is the whole-header match, not the depth column
  assert.equal(guessMapping("custom", ["Hole_ID", "Event", "Event_Depth"]).value, "Event");
  // an interval table, or structure picks, are not events
  assert.equal(looksLikeEventTable(["HOLE_ID", "From", "To", "Event_Code"]), false);
  assert.equal(looksLikeEventTable(["HOLE_ID", "Depth", "Structure_Type", "Alpha"]), false);
  assert.notEqual(guessTargetFor(["HOLE_ID", "Depth", "Structure_Type", "Alpha", "Beta"], "structure.csv"), "custom");
});

test("the layer's note describes the known codes only", () => {
  assert.equal(eventNotes([{ value: "BOCO" }, { value: "tofr" }, { value: "XYZ" }]), "Downhole events (one depth per code per hole): BOCO = base of complete oxidation; TOFR = top of fresh rock.");
  assert.equal(eventNotes([{ value: "XYZ" }]), null);
});

test("depth-pick options: one shallowest pick per hole per code; numeric point logs and interval layers are left out", () => {
  const layers = [
    { id: "c1", name: "event", rows: [
      { hole_id: "A", depth: 12, value: "BOCO" }, { hole_id: "B", depth: 15, value: "BOCO" }, { hole_id: "B", depth: 18, value: "BOCO" },
      { hole_id: "A", depth: 40, value: "TOFR" },
    ] },
    { id: "c2", name: "gamma", rows: [{ hole_id: "A", depth: 1, value: 120 }, { hole_id: "A", depth: 2, value: 130 }] },
    { id: "c3", name: "zones", rows: [{ hole_id: "A", from: 0, to: 3, value: "Z1" }] },
  ];
  const o = eventPickOptions(layers);
  assert.deepEqual(o.map((x) => [x.code, x.holes]), [["BOCO", 2], ["TOFR", 1]]);
  assert.deepEqual(o[0].tops, [{ hole_id: "A", md: 12 }, { hole_id: "B", md: 15 }]);
  assert.equal(defaultEventOption(o, "TOFR").code, "TOFR");
  assert.equal(defaultEventOption(o, "Base of complete oxidation").code, "BOCO");
  assert.equal(defaultEventOption(o, "Something else").code, "BOCO"); // the most-picked
  assert.equal(defaultEventOption([], "x"), null);
  // the Explicit surface seed places one pick per hole, leaving holes that already have one
  const r = seedPicksFromTops([{ hole_id: "B", x: 0, y: 0, z: 0 }], o[0].tops, (h, md) => [1, 2, -md], (i) => `p${i}`);
  assert.equal(r.picks.length, 1); assert.equal(r.picks[0].hole_id, "A"); assert.equal(r.picks[0].z, -12); assert.equal(r.had, 1);
});

test("the import and the Explicit surface tool use them", () => {
  const ip = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(ip, /const evNotes = mapping\.depth && !mapping\.from && !mapping\.to \? eventNotes\(rows\) : null;/);
  const p = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const eventOpts = useMemo\(\(\) => eventPickOptions\(storeCustomLayers\), \[storeCustomLayers\]\);/);
  assert.match(p, /<button onClick=\{seedEvents\}/);
  assert.match(p, /src: "event", event: eventOpt\.code/);
  assert.doesNotMatch(p, /pBtn\(/); // a style object, not a function: calling it crashed the panel (found live)
});
