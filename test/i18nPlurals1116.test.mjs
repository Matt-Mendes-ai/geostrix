// TASKS.csv #1116 — no English "s" glued onto a word, whole counted phrases instead, and inversion verdicts that keep
// their stored text English while the interface shows them translated.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useDictionary } from "../src/lib/i18n.js";
import { fitVerdict, ipFitOf, ipFitStored } from "../src/lib/inversion.js";
import { featureCountText } from "../src/lib/featureCount.js";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.jsx?$/.test(f) ? [p] : []; });
// Export file text is English by rule (#786), so its own plurals may stay
const ENGLISH_OUTPUT = new Set(["meshExport.js"]);

test('#1116 no `n === 1 ? "" : "s"` plural endings in interface code', () => {
  const hits = [];
  for (const f of walk(root)) {
    if (ENGLISH_OUTPUT.has(path.basename(f))) continue;
    readFileSync(f, "utf8").split(/\r?\n/).forEach((l, i) => { if (/=== ?1 \? "" : "s"/.test(l)) hits.push(`${path.relative(root, f)}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `write a singular/plural pair of whole phrases instead: tr(n === 1 ? "{n} hole" : "{n} holes", { n })`);
});

test("#1116 counted phrases per geometry", () => {
  assert.equal(featureCountText(1, "point"), "1 point");
  assert.equal(featureCountText(12, "polygon"), "12 polygons");
  assert.equal(featureCountText(2, "polyline"), "2 lines");
  assert.equal(featureCountText(3, undefined), "3 features");
});

test("#1116 verdicts: English text for the record, translated text for the screen", () => {
  useDictionary("es", {
    "Reached the target fit (misfit {x}x the target) in {n} iterations.": "Alcanzó el ajuste objetivo (desajuste {x}x el objetivo) en {n} iteraciones.",
    "Stopped after {n} iteration before reaching the target fit (misfit {x}x the target) — close, but not converged: run more iterations, or check the uncertainty you entered.": "Se detuvo tras {n} iteración …",
  });
  try {
    const ok = fitVerdict({ phi_d: 100, target: 100, iterations: 6, reachedTarget: true });
    assert.equal(ok.text, "Reached the target fit (misfit 1.00x the target) in 6 iterations.");
    assert.equal(ok.shown, "Alcanzó el ajuste objetivo (desajuste 1.00x el objetivo) en 6 iteraciones.");
    const one = fitVerdict({ phi_d: 120, target: 100, iterations: 1, reachedTarget: false });
    assert.match(one.text, /^Stopped after 1 iteration before/);
    assert.equal(one.shown, "Se detuvo tras 1 iteración …");
    const r = { phi_d: 100, target: 100, iterations: 6, reachedTarget: true, ip: { phi_d: 100, reachedTarget: true, iterations: 4 } };
    assert.ok("shown" in ipFitOf(r));
    const stored = ipFitStored(r);
    assert.ok(!("shown" in stored) && /^Reached the target fit/.test(stored.verdict), JSON.stringify(stored));
  } finally { useDictionary("en", null); }
});
