// TASKS.csv #3876 (#3791's leftover) — the run's time left from its recent speed (src/lib/runEta.js), so a fast start does not promise a minute
// that becomes three. Synthetic progress only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEta } from "../src/lib/runEta.js";

// like #3791's kriging run: the first 10 % in 6 s (cheap blocks), then the rest at a steady 0.5 % a second (180 s for 90 %)
const progressAt = (t) => (t <= 6 ? (0.1 * t) / 6 : Math.min(1, 0.1 + 0.005 * (t - 6)));

test("a fast start: the estimate settles on the true time left instead of growing threefold", () => {
  const eta = makeEta(0), whole = (t) => { const p = progressAt(t); return (t * (1 - p)) / p; }; // #3256's straight line, for comparison
  const said = {};
  for (let t = 0.5; t <= 60; t += 0.5) { eta.push(progressAt(t), t); said[t] = eta.left(t); }
  const truth = (t) => (1 - progressAt(t)) / 0.005;
  // at 30 s (22 % done): the old line says about a minute and a half, the truth is 156 s; the recent rate gets it
  assert.ok(whole(30) < 110, String(whole(30)));
  assert.ok(Math.abs(said[30] - truth(30)) < 5, `${said[30]} vs ${truth(30)}`);
  // from 20 s on, every estimate is within 5 % of the truth: it does not grow as the run goes on
  for (let t = 20; t <= 60; t += 5) assert.ok(Math.abs(said[t] - truth(t)) / truth(t) < 0.05, `${t}: ${said[t]} vs ${truth(t)}`);
});

test("nothing is said before 5 % or 3 s, at the end, or from a repeated reading", () => {
  const eta = makeEta(100);
  eta.push(0.02, 101); assert.equal(eta.left(101), null); // under 5 %
  eta.push(0.06, 102); assert.equal(eta.left(102), null); // under 3 s
  eta.push(0.06, 104); eta.push(0.08, 104); // the same time again: ignored
  assert.ok(eta.left(104) > 0);
  eta.push(1, 110); assert.equal(eta.left(110), null);
});

test("wired: Estimation's run starts the estimator and its 'time left' reads it", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /etaRef\.current = makeEta\(runStartedAt\.current \/ 1000\);/);
  assert.match(m, /etaRef\.current\.push\(p, now\); const left = etaRef\.current\.left\(now\);/);
});
