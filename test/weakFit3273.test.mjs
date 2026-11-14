// TASKS.csv #3273 (Galore Creek review) — three fits of one variogram and no way to carry the right one into kriging: the run-time fit kriged on
// 'r² 0.17' and said 'weak' afterwards, the Variogram tool's model had to be retyped, semivariances read 22800000 with no unit, and the
// dialog never said that kriging takes the anisotropy from a structural trend.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel, WEAK_FIT_R2 } from "../src/lib/estimation.js";
import { lastEstimateSettings, estimateSettingsKey, sendVariogramToEstimation } from "../src/lib/estimateMemory.js";

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const holes = (fn) => { const out = []; for (let h = 0; h < 36; h++) { const hx = (h % 6) * 40, hy = Math.floor(h / 6) * 40; for (let k = 0; k < 40; k++) { const z = -k * 2; out.push({ x: hx, y: hy, z, value: fn(hx, hy, z), hole_id: `H${h}`, length: 2 }); } } return out; };
const opts = { bounds: { xmin: -10, xmax: 210, ymin: -10, ymax: 210, zmin: -80, zmax: 0 }, cellSize: { dx: 20, dy: 20, dz: 10 }, maxBlocks: 200000, method: "ok", searchRadius: 120, minSamples: 1, maxSamples: 16, minHoles: 1 };

test("a weak automatic fit stops a run that asks, with the fit; a good fit, a typed variogram or a run that does not ask goes on", () => {
  seed = 7;
  const noisy = holes(() => rnd() * 100);
  assert.throws(() => estimateBlockModel(noisy, { ...opts, askOnWeakFit: true }), (e) => e.weakFit?.fitted === true && e.weakFit.rSquared < WEAK_FIT_R2 && e.weakFit.sill > 0 && e.weakFit.range > 0);
  assert.ok(estimateBlockModel(noisy, opts).blocksEstimated > 0); // not asked: krige as before
  assert.ok(estimateBlockModel(noisy, { ...opts, askOnWeakFit: true, variogram: { model: "spherical", nugget: 100, sill: 800, range: 80 } }).blocksEstimated > 0); // typed: never asked
  const smooth = holes((x, y, z) => 50 + 30 * Math.sin(x / 120) + 20 * Math.cos(y / 140) + z / 8);
  const r = estimateBlockModel(smooth, { ...opts, askOnWeakFit: true });
  assert.ok(r.variogram.rSquared >= WEAK_FIT_R2 && r.blocksEstimated > 0);
  assert.equal(WEAK_FIT_R2, 0.5);
});

test("the worker and the client carry the fit on the error", () => {
  assert.match(src("lib/estimation.worker.js"), /\.\.\.\(err\?\.weakFit \? \{ weakFit: err\.weakFit \} : \{\}\)/);
  assert.match(src("lib/estimationClient.js"), /finish\(reject, Object\.assign\(new Error\(d\.message\), d\.weakFit \? \{ weakFit: d\.weakFit \} : \{\}\)\)/);
});

test("sendVariogramToEstimation: the next dialog opens on kriging with the model; another element's cap is dropped", () => {
  const project = { id: "p3273" }, key = estimateSettingsKey(project);
  lastEstimateSettings.set(key, { symbol: "Au", capValue: 7.5, capByDomain: { A: 3 }, method: "idw2", cellSize: 12 });
  const s = sendVariogramToEstimation(project, { symbol: "Cu", model: "spherical", nugget: 4130000.4, sill: 31600000, range: 64.93, from: "Downhole only, lag 2 m, r² 0.99" });
  assert.deepEqual([s.method, s.symbol, s.sourceKey, s.vgModel, s.vgNugget, s.vgSill, s.vgRange, s.cellSize], ["ok", "Cu", "assay", "spherical", "4130000", "31600000", "64.93", 12]);
  assert.equal(s.capValue, undefined); assert.equal(s.capByDomain, undefined);
  assert.equal(lastEstimateSettings.get(key), s);
  lastEstimateSettings.set(key, { symbol: "Cu", capValue: 25600 });
  assert.equal(sendVariogramToEstimation(project, { symbol: "Cu", model: "exponential", nugget: 1, sill: 2, range: 3 }).capValue, 25600); // the same element keeps its cap
  lastEstimateSettings.delete(key);
});

test("wiring: the dialog asks, the Variogram tool sends, semivariances with their unit, the trend's anisotropy said; keys", () => {
  const m = src("components/GradeEstimationModal.jsx");
  assert.match(m, /import \{ lastEstimateSettings, estimateSettingsKey \} from "\.\.\/lib\/estimateMemory\.js";/);
  assert.ok(!/const lastEstimateSettings = new Map\(\)/.test(m));
  assert.match(m, /\.\.\.\(method === "ok" && !weakFitAccepted\.current \? \{ askOnWeakFit: true \} : \{\}\)/);
  assert.match(m, /if \(e\.weakFit\) setWeakFitAsk\(e\.weakFit\);/);
  assert.match(m, /onClick=\{\(\) => \{ setWeakFitAsk\(null\); setMethod\("idw2"\); setRerun\(\(k\) => k \+ 1\); \}\}/);
  assert.match(m, /onClick=\{\(\) => \{ setWeakFitAsk\(null\); weakFitAccepted\.current = true; setRerun\(\(k\) => k \+ 1\); \}\}/);
  assert.match(m, /useEffect\(\(\) => \{ if \(rerun\) run\(\); \}, \[rerun\]\);/);
  assert.match(m, /v2: `\$\{fmtSemi\(result\.variogram\.nugget\)\}/);
  assert.match(m, /tr\("With the trend \\"\{name\}\\", kriging reads distances in its frame/);
  assert.match(m, /tr\("From the Variogram tool: \{how\}\."/);
  const v = src("components/VariogramModal.jsx");
  assert.match(v, /sendVariogramToEstimation\(project, \{ symbol, model: result\.fit\.model, nugget: result\.fit\.nugget, sill: result\.fit\.sill, range: result\.fit\.range, from: how \}\);/);
  assert.match(v, /result\.fit && result\.transform === "none" && \(/);
  assert.match(v, /<Stat label=\{tr\("Sill"\)\} value=\{semi\(result\.fit\.sill\)\} \/>/);
  // a Downhole-only model sends a range measured along the holes: said when it is sent (found live: 4.7 m on holes 23 m apart)
  assert.match(v, /setSentToEst\(\{ symbol, how, downhole: result\.holeMode === "downhole", range: result\.fit\.range \}\)/);
  assert.match(v, /sentToEst\.downhole \? ` \$\{tr\("Its range \(\{r\} m\) is measured down the holes;/);
  // the dialog's memory is a small module: the Variogram tool does not load the Estimation dialog
  assert.ok(!/from "\.\/GradeEstimationModal\.jsx"/.test(v));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["The automatic variogram fit is weak.", "Weak variogram fit", "Estimate by inverse distance (power 2)", "Krige with it anyway", "Use this model in Estimation", "From the Variogram tool: {how}.", "flat search", "{mode}, lag {lag} m, r² {r}",
      "The variogram fitted to these composites is weak (r² {r}): nugget {n}, sill {s}, range {range} m. Kriging with it would rest the weights on a guess."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
