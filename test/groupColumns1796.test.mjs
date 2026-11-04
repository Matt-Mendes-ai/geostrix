// TASKS.csv #1796 (review #1646, Kodiak) — thresholds by a sample column: split by medium first, and only categorical columns offered
import test from "node:test";
import assert from "node:assert/strict";
import { groupOptions, groupKeyFn } from "../src/lib/thresholds.js";

const soil = (i, target) => ({ medium: "soil", attrs: { Target: target, Description: `free text ${i}`, "WT. SAMPLE g": String(200 + i), Date_Sampled: `2023-day-${i}` /* 40 one-day values, as Kodiak's 85 */, Horizon: i % 2 ? "B" : "C" } });
const rock = (i) => ({ medium: "rock chip", attrs: { Description: `rock ${i}`, Lithology: ["DIO", "AND", "VCL"][i % 3] } });
const samples = [...Array.from({ length: 40 }, (_, i) => soil(i, i < 30 ? ["Eclipse", "Lee Side"][i % 2] : "")), ...Array.from({ length: 12 }, (_, i) => rock(i))];

test("#1796 the column list: categorical columns only (2-30 values, not numbers), survey-style names first", () => {
  const cols = groupOptions(samples).filter((o) => o.kind === "column").map((o) => o.label);
  assert.deepEqual(cols, ["Horizon", "Target", "Lithology"]);
  assert.ok(!cols.includes("Description") && !cols.includes("WT. SAMPLE g") && !cols.includes("Date_Sampled"));
});

test("#1796 a column grouping is split by medium when the samples hold several; one medium keeps plain keys", () => {
  const k = groupKeyFn("attr:Target", [], samples);
  assert.equal(k(samples[0]), "soil · Eclipse");
  assert.equal(k(samples[35]), "soil · (blank)");
  assert.equal(k(samples[45]), "rock chip · (blank)", "rock chips no longer share the soils' blank group");
  const soilsOnly = samples.filter((s) => s.medium === "soil");
  assert.equal(groupKeyFn("attr:Target", [], soilsOnly)(soilsOnly[0]), "Eclipse");
  assert.equal(groupKeyFn("attr:Target")(samples[45]), "(blank)", "without samples: as before");
  assert.equal(groupKeyFn("medium", [], samples)(samples[45]), "rock chip");
});
