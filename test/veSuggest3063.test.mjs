// TASKS.csv #3063 (the rest of #2934) — a project far wider than its holes are deep gets a vertical exaggeration suggested once.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { veSuggestion, SUGGEST_RATIO } from "../src/lib/viewer/veSuggest.js";

const holes = (nx, ny, spacing, z0, depth) => { const out = []; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push({ hole_id: `H${i}_${j}`, wx: [i * spacing, i * spacing], wy: [j * spacing, j * spacing], wz: [z0 + (i % 5), z0 + (i % 5) - depth] }); return out; };

test("WA iron's proportions (21.6 km of holes, about 150 m of relief and depth): VE 10x suggested; a compact project: none", () => {
  const wa = holes(20, 16, 1137, 400, 70); // 21.6 x 17.1 km, collars 400-404 m, holes 70 m: depth range 74 m
  const s = veSuggestion(wa);
  assert.ok(s && s.ratio > 200, JSON.stringify(s));
  assert.equal(s.ve, 20);
  const shallowField = holes(20, 16, 1137, 400, 140); // 144 m of range
  assert.equal(veSuggestion(shallowField).ve, 10);
  assert.equal(veSuggestion(holes(10, 10, 50, 400, 300)), null, "500 m of 300 m holes");
  assert.ok(SUGGEST_RATIO === 50);
  assert.equal(veSuggestion([]), null);
});

test("a suspect 0 m collar does not hide the suggestion (#3004's rule)", () => {
  const wa = holes(20, 16, 1137, 400, 140);
  wa.push({ hole_id: "ZERO", wx: [5000, 5000], wy: [5000, 5000], wz: [0, -140] });
  assert.equal(veSuggestion(wa).ve, 10, "the 0 m collar is left out of the depth range");
});

test("wiring: once per project, at 1x, after the holes are built; the notice names where the control is", () => {
  const h = fs.readFileSync(new URL("../src/modules/viewer/useVeSuggestion.js", import.meta.url), "utf8");
  assert.match(h, /if \(!projectKey \|\| ve > 1 \|\| !tracesRef\.current\?\.length \|\| done\.current\.has\(projectKey\)\) return;/);
  assert.match(h, /localStorage\.setItem\(key\(projectKey\), "1"\)/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /useVeSuggestion\(\{ tracesRef, tracesSeq, ve: veOf\(figureOverlay\.ve\), projectKey: collars\.length \?/);
});
