// TASKS.csv #2890 (review #2876, WA bedded iron) — the susceptibility log kept -821,754.9 (a saturated tool, beside a median near 133) and
// density kept -1.47 g/cc: the headers name no unit, so no negative was questioned, and -821,754.9 is not 1,000 times the 99th percentile.
// A channel whose name cannot be negative (density, gamma, caliper) is checked as such, and a negative reading more than 50 interquartile
// ranges under the median is questioned. Real highs are still kept (#2332's uranium gamma).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { channelNoData, noDataText } from "../src/lib/downholeLogChannels.js";

// a susceptibility-like channel: 70..370 (median ~220), a few real small negatives, a saturated tool at -821,754.9 and the -999 code
const sus = [];
const row = (s, d, g) => ({ Suscep_Best: s, Density_Best: d, Gamma_Best: g, v: s });
for (let i = 0; i < 3000; i++) sus.push(row(70 + (i % 300), 2 + (i % 7) * 0.1, 40 + (i % 50)));
for (const v of [-0.5, -3, -40]) sus.push(row(v, 2.4, 50));
for (let i = 0; i < 12; i++) sus.push(row(-821754.9, -1.47, 54938 - 731 * i)); // real highs vary (#3042 questions one value written again and again)
for (let i = 0; i < 20; i++) sus.push(row(-999, -999, 60));

test("a reading far below the channel's body is a no-data code; small negatives are readings", () => {
  const nd = channelNoData(sus, "Suscep_Best", "");
  assert.equal(nd.n, 32); assert.equal(noDataText(nd), "-999 × 20, -821754.9 × 12");
  assert.ok(!nd.values.has(-40) && !nd.values.has(-0.5), "diamagnetic negatives stay");
});

test("density and gamma cannot be negative, whatever unit the header names (none here)", () => {
  const d = channelNoData(sus, "Density_Best", "");
  assert.equal(d.n, 32); assert.ok(d.values.has(-1.47) && d.values.has(-999));
  assert.equal(channelNoData([...sus.slice(0, 100), { Gamma_Best: -2 }], "Gamma_Best", "").n, 1);
  assert.equal(channelNoData([...sus.slice(0, 100).map((r) => ({ "Natural gamma": r.Gamma_Best })), { "Natural gamma": -2 }], "Natural gamma", "").n, 1);
  assert.equal(channelNoData([...sus.slice(0, 100), { Suscep_Best: -2 }], "Suscep_Best", ""), null, "susceptibility may be slightly negative");
  // a channel whose name says nothing keeps a moderate negative, as before (#2332)
  assert.equal(channelNoData([{ v: -20 }, { v: 10 }, { v: 15 }], "v", "mV"), null);
});

test("real highs far above the body are kept (#2332's uranium gamma beside a median near 100)", () => {
  const g = channelNoData(sus, "Gamma_Best", "");
  assert.equal(g, null, "54,938 is a reading: only the low side has the fence");
});

test("the dialog names the reasons", () => {
  const box = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  const k = "{col}: {n} value(s) look like no-data codes ({codes}): a null sentinel, a negative value in a channel that cannot be negative, a reading far below the channel's others, one more than 1,000 times its 99th percentile, or one value repeated reading after reading at the channel's extreme.";
  assert.ok(box.includes(`tr("${k}"`));
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))[k], l);
});
