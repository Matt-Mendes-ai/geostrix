// TASKS.csv #1073 (review #1016) — surface samples are saved as exact columns (like assays) and load back unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { FIELDS, PROJECT_VERSION } from "../src/lib/projectFields.js";

const field = FIELDS.find((f) => f.key === "surfaceSamples");
const els = ["Au", "Ag", "Cu", "Pb", "Zn", "As", "Sb", "Mo"];
const samples = Array.from({ length: 5000 }, (_, i) => ({
  sample_id: `S${i}`, x: 600000 + (i % 100) * 25.5, y: 5800000 + Math.floor(i / 100) * 25, z: i % 7 ? 1000 + i * 0.01 : null,
  medium: i % 3 ? "soil" : "stream sediment",
  values: Object.fromEntries(els.filter((_, k) => (i + k) % 5).map((e, k) => [e, (i * 7 + k) / 13])),
  ...(i % 4 === 0 ? { bdl: ["Au", "Ag"] } : {}), ...(i % 9 === 0 ? { nd: ["Sb"] } : {}),
  ...(i % 2 ? { attrs: { domain: `D${i % 4}`, project: "Harry" } } : {}),
}));

test("#1073 saved as columns, smaller, and back to the same rows", () => {
  assert.ok(PROJECT_VERSION >= 19);
  const saved = field.save(samples);
  assert.ok(saved.__compactTable, "columns");
  const raw = JSON.stringify(samples).length, cols = JSON.stringify(saved).length;
  assert.ok(cols < raw * 0.7, `${cols} vs ${raw}`);
  const back = field.load({ surfaceSamples: JSON.parse(JSON.stringify(saved)) });
  assert.equal(back.length, samples.length);
  // the same content (key order may differ): compare through a canonical JSON
  const sorted = (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
  const canon = (o) => JSON.stringify(sorted(o));
  for (let i = 0; i < samples.length; i += 1) assert.equal(canon(back[i]), canon(samples[i]), `row ${i}`);
  assert.equal(field.save(samples), saved, "cached per array: the next autosave re-encodes nothing");
});

test("#1073 small sets and files from before stay plain arrays", () => {
  const few = samples.slice(0, 10);
  assert.equal(field.save(few), few);
  assert.deepEqual(field.load({ surfaceSamples: few }), few);
  assert.deepEqual(field.load({}), []);
});
