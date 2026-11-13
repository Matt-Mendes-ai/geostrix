// TASKS.csv #3042 (follow-up of #2890, WA bedded iron) — a saturated tool writes one value on reading after reading. The same value on 8
// or more consecutive readings at the channel's own extreme is questioned as a no-data code even when the fences of #2890 let it through.
import test from "node:test";
import assert from "node:assert/strict";
import { channelNoData } from "../src/lib/downholeLogChannels.js";

const body = (n) => Array.from({ length: n }, (_, i) => ({ Suscep_Best: String(60 + ((i * 37) % 400)) }));

test("a high value written 12 times in a row (inside 1,000 x p99) is questioned; the same value scattered is not", () => {
  const rows = [...body(5000), ...Array.from({ length: 12 }, () => ({ Suscep_Best: "9999.9" })), ...body(3000)];
  const nd = channelNoData(rows, "Suscep_Best", "");
  assert.ok(nd && nd.values.has(9999.9), "the saturated run");
  assert.equal(nd.codes.find(([v]) => v === 9999.9)[1], 12);
  const scattered = body(8000).map((r, i) => (i % 700 === 0 ? { Suscep_Best: "9999.9" } : r));
  assert.equal(channelNoData(scattered, "Suscep_Best", ""), null, "12 isolated highs are readings");
});

test("a run in the body of the channel, a short run, or a run of 0 is not questioned", () => {
  const mid = [...body(5000), ...Array.from({ length: 20 }, () => ({ Suscep_Best: "250" })), ...body(100)];
  assert.equal(channelNoData(mid, "Suscep_Best", ""), null);
  const short = [...body(5000), ...Array.from({ length: 5 }, () => ({ Suscep_Best: "9999.9" })), ...body(100)];
  assert.equal(channelNoData(short, "Suscep_Best", ""), null);
  const zeros = [...body(5000), ...Array.from({ length: 30 }, () => ({ Suscep_Best: "0" }))];
  assert.equal(channelNoData(zeros, "Suscep_Best", ""), null, "0 on many readings (casing, open hole) is left to the user");
});
