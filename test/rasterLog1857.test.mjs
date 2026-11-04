// TASKS.csv #1857 (review #1646, Kodiak) — a log stretch for value rasters (a resistivity slice), log-spaced legend stops, suggested
// when the values span more than two decades
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeStretch } from "../src/lib/idw.js";
import { rasterStops, decadesSpanned } from "../src/lib/rasterColour.js";
import { stopsAreLogSpaced, legendScale } from "../src/lib/legendScale.js";

// 32 to 3,852 ohm.m, evenly spread in log: median about 351
const values = Float32Array.from({ length: 1001 }, (_, i) => 32 * (3852 / 32) ** (i / 1000));

test("#1857 the log stretch puts the median near the middle of the ramp; linear 2-98 % squeezed it into the bottom fifth", () => {
  const med = values[500];
  const lin = makeStretch(values, "p2-98"), lg = makeStretch(values, "log");
  assert.ok(lin.t(med) < 0.12, String(lin.t(med)));
  assert.ok(Math.abs(lg.t(med) - 0.5) < 0.01, String(lg.t(med)));
  assert.ok(lg.log && lg.lo > 32 && lg.hi < 3852);
  assert.equal(lg.t(0), 0); assert.equal(lg.t(-5), 0);
  const neg = makeStretch(Float32Array.from([-3, -2, -1, 0]), "log");
  assert.equal(neg.mode, "p2-98", "no positive value: the 2-98 % clip");
});

test("#1857 legend stops are log-spaced, the legend draws a log bar, and the menu suggests it past one decade", () => {
  const lg = makeStretch(values, "log");
  const stops = rasterStops({ palette: "viridis" }, lg.lo, lg.hi, true);
  assert.ok(stopsAreLogSpaced(stops));
  const L = legendScale({ colorMode: "continuous", stops }, lg.lo, lg.hi);
  assert.ok(L.log && L.ticks.some((t) => t.label === "100") && L.ticks.some((t) => t.label === "1000"));
  assert.ok(!stopsAreLogSpaced(rasterStops({ palette: "viridis" }, lg.lo, lg.hi)), "linear stops stay linear");
  assert.ok(decadesSpanned(values) > 1.9 && decadesSpanned(values) < 2.1);
  assert.equal(decadesSpanned(Float32Array.from([-1, -2, -3])), 0);
  const c = readFileSync(new URL("../src/components/RasterColourControls.jsx", import.meta.url), "utf8");
  assert.ok(c.includes('<option value="log">{decades > 1 ? tr("Log (suggested: the values span {n} decades)"'));
});
