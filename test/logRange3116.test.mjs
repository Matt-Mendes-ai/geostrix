// TASKS.csv #3116 (split from #2953) — the built-in downhole logs (Mag. susc., SG, RQD, recovery) get a valid range and a despike (a moving
// median over a typed window), stored with the project (project.logValidRange[key] = { range, despikeM }); an imported log gets the despike
// on its layer beside its #2953 range. Both ride on the log's choice / layer and are applied in sourceAssays, so every reader (Downhole logs,
// Estimation, Grade shell, X-Y, the hole-value grid) reads the same readings, and the choice's label says so.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericSourceChoices, sourceAssays, logFilterOf, logFilterLabel } from "../src/lib/numericSources.js";
import { holeValueSources } from "../src/lib/holeValueGrid.js";

const rows = [];
for (const h of ["A", "B"]) for (let i = 0; i < 20; i++) rows.push({ hole_id: h, from: i * 0.5, to: i * 0.5 + 0.5, value: i === 7 && h === "A" ? 900 : i === 12 && h === "B" ? -821754.9 : +(0.01 * (i + 1)).toFixed(2) });
const layers = { magsusc: rows };
const val = (d, h) => d.assays.filter((r) => r.hole_id === h).map((r) => +Object.values(r.values)[0].toFixed(3));

test("the words a filtered log's label carries", () => {
  assert.deepEqual(logFilterOf({ range: [0, 5000], despikeM: 1 }), { validRange: [0, 5000], despikeM: 1 });
  assert.deepEqual(logFilterOf({ range: [null, null], despikeM: 0 }), {});
  assert.equal(logFilterLabel(logFilterOf({ range: [0, 5000], despikeM: 1 })), " (range 0–5,000, despiked 1 m)");
  assert.equal(logFilterLabel(logFilterOf({ range: [null, 2.5] })), " (range …–2.5)");
  assert.equal(logFilterLabel({}), "");
});

test("a built-in log: no filter is as before; with one, the choice carries it and says so; the symbol (what an estimate is named) stays", () => {
  const plain = numericSourceChoices({ layers, customLayers: [] })[0];
  assert.equal(plain.label, "Mag. susc."); assert.equal(plain.validRange, undefined); assert.equal(plain.despikeM, undefined);
  const ch = numericSourceChoices({ layers, customLayers: [], logValidRange: { magsusc: { range: [0, 5000], despikeM: 1 } } })[0];
  assert.equal(ch.label, "Mag. susc. (range 0–5,000, despiked 1 m)");
  assert.equal(ch.symbol, "Mag. susc.");
  assert.deepEqual([ch.validRange, ch.despikeM], [[0, 5000], 1]);
  assert.equal(numericSourceChoices({ layers, customLayers: [], logValidRange: { sg: { despikeM: 2 } } })[0].label, "Mag. susc.", "another log's entry leaves this one alone");
});

test("sourceAssays: the range first, then the moving median along each hole; with neither, the readings as logged", () => {
  const raw = sourceAssays(numericSourceChoices({ layers, customLayers: [] })[0], { layers });
  assert.equal(raw.assays.length, 40); assert.equal(raw.outOfRange, undefined); assert.equal(raw.despikeM, undefined);
  assert.deepEqual(val(raw, "A").slice(5, 10), [0.06, 0.07, 900, 0.09, 0.1]);
  const d = sourceAssays(numericSourceChoices({ layers, customLayers: [], logValidRange: { magsusc: { range: [0, 5000], despikeM: 1 } } })[0], { layers });
  assert.equal(d.outOfRange, 1, "the -821,754.9 bin left out"); assert.equal(d.despikeM, 1); assert.equal(d.assays.length, 39);
  // window 1 m on 0.5 m bins: each reading with its two neighbours. The spike of 900 takes the median of 0.07, 900, 0.09
  assert.deepEqual(val(d, "A").slice(5, 10), [0.06, 0.07, 0.09, 0.1, 0.1]);
  assert.deepEqual(val(d, "A").slice(0, 2), [0.01, 0.02], "an end reading: itself and one neighbour (an even count: the lower one, always a reading)");
  const onlyRange = sourceAssays(numericSourceChoices({ layers, customLayers: [], logValidRange: { magsusc: { range: [0, null] } } })[0], { layers });
  assert.deepEqual(val(onlyRange, "A").slice(7, 8), [900], "a range alone does not despike");
  // depth-only readings and a reading with no depth: the despike uses depths; the depthless one is skipped as before
  const pts = [{ hole_id: "P", depth: 1, value: 1 }, { hole_id: "P", depth: 1.4, value: 50 }, { hole_id: "P", depth: 1.8, value: 1.2 }, { hole_id: "P", value: 3 }];
  const p = sourceAssays(numericSourceChoices({ layers: { sg: pts }, customLayers: [], logValidRange: { sg: { despikeM: 1 } } })[0], { layers: { sg: pts } });
  assert.deepEqual(p.assays.map((r) => r.values["Specific gravity"]), [1, 1.2, 1.2]); assert.equal(p.skipped, 1);
});

test("an imported log: the despike on its layer, said in its label, applied in sourceAssays (#2953's range as before)", () => {
  const custom = [{ id: "g", name: "log: Gamma", unit: "cps", despikeM: 1, validRange: [0, null], rows: rows.map((r) => ({ ...r })) }];
  const cc = numericSourceChoices({ layers: {}, customLayers: custom })[0];
  assert.equal(cc.label, "log: Gamma (range 0–…, despiked 1 m)"); assert.equal(cc.symbol, "log: Gamma");
  const d = sourceAssays(cc, { customLayers: custom });
  assert.equal(d.outOfRange, 1); assert.equal(d.despikeM, 1);
  assert.deepEqual(val(d, "A").slice(6, 9), [0.07, 0.09, 0.1]);
});

test("stored with the project; the pane, the hole-value grid and the store's mirror wired", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const setLogValidRange = useCallback\(\(key, entry\) => setProject\(\(p\) => \{ const next = \{ \.\.\.\(p\.logValidRange \|\| \{\}\) \};/);
  assert.match(s, /setDrillRates \/\* #2581 \*\/, setLogValidRange \/\* #3116 \*\//);
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /numericSourceChoices\(\{ layers, customLayers, models: false, logValidRange \}\)/);
  assert.match(p, /\{builtinKey && <ValidRangeField range=\{logValidRange\?\.\[builtinKey\]\?\.range\}/);
  assert.match(p, /\{builtinKey && <DespikeField value=\{logValidRange\?\.\[builtinKey\]\?\.despikeM\}/);
  assert.match(p, /\{logLayer && <DespikeField value=\{logLayer\.despikeM\}/);
  assert.doesNotMatch(p, /useState\(/, "#2394 — kept state only");
  assert.match(readFileSync(new URL("../src/lib/viewerDirty.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /const STORE_WINS = \["unit", "validRange", "despikeM"\];/);
  const src = holeValueSources({ layers, customLayers: [], logValidRange: { magsusc: { range: [0, 5000] } } }).find((x) => x.kind === "log");
  assert.equal(src.label, "Mag. susc. (range 0–5,000)"); assert.deepEqual(src.choice.validRange, [0, 5000]);
});
