// TASKS.csv #3758 (#3876's leftover) — the one-click caps over the MINERALISED population: the samples at or above where the grades split
// (read from the data), not the whole column, whose P97.5 can sit inside the ore. Synthetic, seeded grades.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mineralisedPercentiles, MIN_N } from "../src/lib/mineralisedPercentiles.js";
import { weightedPercentile } from "../src/lib/probPlot.js";

let k = 9; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647, g = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
// 95 % barren background around 0.02, 5 % ore around 3 (log-normal)
const values = Array.from({ length: 4000 }, () => (rnd() < 0.05 ? 10 ** (0.5 + 0.3 * g()) : 10 ** (-1.7 + 0.25 * g()))), lengths = values.map(() => 1);

test("the mineralised P97.5 / P99 come from the ore, the whole column's from its edge", () => {
  const m = mineralisedPercentiles(values, lengths);
  assert.ok(m && m.cut > 0.05 && m.cut < 1, JSON.stringify(m)); // between the populations
  assert.ok(m.n > 150 && m.n < 260);
  const whole = weightedPercentile(values, lengths, 97.5);
  assert.ok(whole < 4 && m.p975 > whole, `${whole} vs ${m.p975}`); // the whole column's P97.5 is an ordinary ore grade
  assert.ok(m.p99 >= m.p975);
});

test("no split, or too few above it: no mineralised percentiles (the dialog keeps all samples)", () => {
  assert.equal(mineralisedPercentiles(values.slice(0, MIN_N - 1), lengths), null);
  assert.equal(mineralisedPercentiles(values.map(() => 1), lengths), null);
});

test("wired: the cap buttons offer the mineralised samples first, all samples as the other choice; the metal removed stays over all", () => {
  const c = readFileSync(new URL("../src/components/CapAuditHint.jsx", import.meta.url), "utf8");
  assert.match(c, /const \[over, setOver\] = useState\("mineralised"\);/);
  assert.match(c, /const pcts = over === "mineralised" && minPcts \? minPcts : allPcts;/);
  assert.match(c, /capAudit\(assays, symbol, unit, elementUnits, c\)/);
});
