// TASKS.csv #2000 — Huber-regression levelling on the tie sites (Main & Champion 2022), beside the one-factor tie level and quantile matching
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { huberLine, fitLevelling, leveller, writeLevelled } from "../src/lib/levelling.js";

test("huberLine: an exact line comes back; one wild tie barely moves it, where least squares tilts", () => {
  const xs = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], ys = xs.map((x) => 0.2 + 0.9 * x);
  const exact = huberLine(xs, ys);
  assert.ok(Math.abs(exact.a - 0.2) < 1e-9 && Math.abs(exact.b - 0.9) < 1e-9);
  // small scatter, then one tie 1.5 log units off (a nugget)
  const noisy = ys.map((y, i) => y + [0.02, -0.01, 0.015, -0.02, 0.01, -0.015, 0.02, -0.01][i]);
  noisy[7] += 1.5;
  const h = huberLine(xs, noisy);
  assert.ok(Math.abs(h.b - 0.9) < 0.05, `Huber slope ${h.b}`);
  assert.ok(h.downweighted >= 1);
  // ordinary least squares on the same points (k huge = no downweighting)
  const ols = huberLine(xs, noisy, { k: 1e9 });
  assert.ok(Math.abs(ols.b - 0.9) > 0.15, `OLS slope ${ols.b} is pulled by the outlier`);
  assert.equal(huberLine([1, 2, 3], [1, 2, 3]), null, "under 5 ties");
  assert.equal(huberLine([1, 1, 1, 1, 1], [1, 2, 3, 4, 5]), null, "no spread in x");
});

// two surveys on the same 8 sites: B reads 2x A at low values and 1.5x at high ones, plus one site where B is 10x
const sites = [5, 10, 20, 40, 80, 160, 320, 640];
const samples = [
  ...sites.map((v, i) => ({ x: i * 100, y: 0, medium: "soil", attrs: { source: "A" }, values: { Cu: v } })),
  ...sites.map((v, i) => ({ x: i * 100 + 3, y: 0, medium: "soil", attrs: { source: "B" }, values: { Cu: i === 3 ? v * 10 : 2 * v * (v / 5) ** (-0.06) } })),
];
const opts = { symbol: "Cu", medium: "soil", column: "source", reference: "A", survey: "B", radiusM: 25 };

test("fitLevelling: the Huber line beside the median factor; the leveller maps B onto A", () => {
  const fit = fitLevelling(samples, opts);
  assert.equal(fit.ties.n, 8);
  assert.ok(fit.ties.huber, "a line");
  const f = leveller(fit, "huber");
  // B's 2 x 160 x (32)^-0.06 back to about 160
  const b160 = 2 * 160 * 32 ** -0.06;
  assert.ok(Math.abs(f(b160) / 160 - 1) < 0.03, `${f(b160)}`);
  assert.equal(f(0), 0);
  const w = writeLevelled(samples, [{ symbol: "Cu", unit: "ppm" }], fit, "huber", opts);
  const basis = w.samples.find((s) => s.attrs.source === "B").attrs.Cu_lev_basis;
  assert.match(basis, /Huber regression \(k = 1\.345\) on 8 tie sites within 25 m \(Main & Champion 2022\)/);
});

test("wiring: the panel offers the Huber line when there is one", () => {
  const s = readFileSync(new URL("../src/components/LevellingPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /const canHuber = !!fit\?\.ties\?\.huber;/);
  assert.match(s, /methodPick === "huber" && canHuber \? "huber"/);
  assert.match(s, /tr\("Fit a line through the ties instead \(Huber regression on log values, after Main & Champion 2022\)/);
});
