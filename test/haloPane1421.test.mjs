// TASKS.csv #1421 — the alteration halo's only run control was an unlabelled icon, and POT (zero logged length) was offered and
// failed with 'indicator never crosses 0.5'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("a labelled button; codes with no logged length are shown disabled, with the reason", () => {
  const s = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(s, /<><Layers3 size=\{14\} \/>\{tr\("Build halo"\)\}<\/>/);
  assert.match(s, /const len = Number\(r\.to\) - Number\(r\.from\); if \(k && len > 0\)|len = Number\(r\.to\) - Number\(r\.from\); if \(k && len > 0\)/);
  assert.match(s, /altLoggedM\.get\(u\) > 0 \? <option key=\{u\} value=\{u\}>\{u\}<\/option> : <option key=\{u\} value=\{u\} disabled>\{tr\("\{code\} \(no logged length\)", \{ code: u \}\)\}<\/option>/);
});

test("a code logged over less than one cell says so when no halo can be made (POT: one 0.5 m interval, 21.4 m cells)", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /const m = targetRows\.reduce\(\(t, r\) => t \+ \(Number\(r\.to\) - Number\(r\.from\)\), 0\); return m < cell \?/);
  assert.match(s, /is logged over only \{m\} m \(\{n\} interval\(s\)\), less than one \{cell\} m cell/);
});
