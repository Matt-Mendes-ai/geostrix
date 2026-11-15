// TASKS.csv #3423 (#2206 Phase 1) — the open's column tables expanded into rows a slice at a time (expandTableSliced / expandPayloadSliced): the
// same rows and fields as the one-piece expansion, the same #3118 cache seeding, and the work cut into short steps.
import test from "node:test";
import assert from "node:assert/strict";
import { compactTable, expandTable, expandTableSliced, budgetPause } from "../src/lib/compactTable.js";
import { expandPayloadSliced, fieldsFromPayload, payloadFromFields, emptyFields } from "../src/lib/projectFields.js";

const EL = ["Au", "Ag", "Cu", "Pb", "Zn"];
const assaysOf = (n) => Array.from({ length: n }, (_, i) => ({ hole_id: `H${i % 97}`, from: i * 1.5, to: i * 1.5 + 1.5, sample_id: `S${i}`, values: Object.fromEntries(EL.map((e, k) => [e, (i * (k + 3)) % 101 / 10])), ...(i % 11 === 0 ? { qualifiers: { Au: "<" } } : {}), ...(i % 13 === 0 ? { note: null } : {}) }));

test("expandTableSliced gives expandTable's rows and seeds the same save cache", async () => {
  const rows = assaysOf(12000);
  const stored = JSON.parse(JSON.stringify(compactTable(rows)));
  const a = expandTable(JSON.parse(JSON.stringify(stored)));
  let steps = 0;
  const b = await expandTableSliced(stored, () => { steps++; return null; });
  assert.deepEqual(b, a);
  assert.ok(steps > 10, `${steps} steps`);
  assert.equal(compactTable(b), stored, "the first save after the open writes the file's own columns back (#3118)");
  assert.notEqual(b[0].qualifiers, b[11]?.qualifiers, "an object value is a copy per row (#721)");
  const plain = [{ a: 1 }]; assert.equal(await expandTableSliced(plain), plain, "rows pass through");
});

test("expandPayloadSliced then fieldsFromPayload: the same fields as the one-piece open, for every column table kind", async () => {
  const live = { ...emptyFields(),
    assays: assaysOf(3000),
    survey: Array.from({ length: 2500 }, (_, i) => ({ hole_id: `H${i % 97}`, depth: Math.floor(i / 97) * 30, azimuth: (i * 7) % 360, dip: -60 })),
    surfaceSamples: Array.from({ length: 2200 }, (_, i) => ({ sample_id: `SS${i}`, x: 500000 + i, y: 6200000, medium: i % 2 ? "soil" : "rock", values: { Au: i % 7 } })),
    layers: { ...emptyFields().layers, litho: Array.from({ length: 2600 }, (_, i) => ({ hole_id: `H${i % 97}`, from: i, to: i + 1, value: ["AND", "BAS"][i % 2] })) },
    customLayers: [{ id: "c1", name: "gamma", rows: Array.from({ length: 4000 }, (_, i) => ({ hole_id: `H${i % 97}`, depth: i * 0.1, value: i % 300 })) }, { id: "c2", name: "small", rows: [{ hole_id: "H1", depth: 1, value: 2 }] }],
  };
  const file = JSON.parse(JSON.stringify(payloadFromFields(live)));
  for (const k of ["assays", "survey", "surfaceSamples"]) assert.ok(file[k].__compactTable, `${k} written as columns`);
  assert.ok(file.layers.litho.__compactTable && file.customLayers[0].rows.__compactTable);
  const direct = fieldsFromPayload(JSON.parse(JSON.stringify(file)), "p.geostrix.json");
  const pre = await expandPayloadSliced(JSON.parse(JSON.stringify(file)));
  assert.ok(Array.isArray(pre.assays) && Array.isArray(pre.survey) && Array.isArray(pre.layers.litho) && Array.isArray(pre.customLayers[0].rows), "expanded before fieldsFromPayload");
  const sliced = fieldsFromPayload(pre, "p.geostrix.json");
  for (const k of ["assays", "survey", "surfaceSamples", "layers", "customLayers"]) assert.deepEqual(sliced[k], direct[k], k);
  assert.deepEqual(sliced.assays, live.assays.map((r) => JSON.parse(JSON.stringify(r))));
});

test("the work comes in short steps: with a 12 ms budget no stretch between yields to the window is long", async () => {
  const stored = JSON.parse(JSON.stringify(compactTable(assaysOf(60000))));
  const base = budgetPause(12);
  let last = performance.now(), worst = 0, yields = 0;
  const pause = () => { const p = base(); if (!p) return null; const t = performance.now(); worst = Math.max(worst, t - last); yields++; return p.then(() => { last = performance.now(); }); };
  const rows = await expandTableSliced(stored, pause);
  worst = Math.max(worst, performance.now() - last);
  assert.equal(rows.length, 60000);
  assert.ok(yields > 3, `${yields} yields`);
  assert.ok(worst < 250, `the longest stretch ${worst.toFixed(0)} ms`); // one slice of 2,048 rows plus the 12 ms budget; loose for a loaded machine
});
