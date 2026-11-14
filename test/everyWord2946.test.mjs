// TASKS.csv #2946 — the contour-levels box accepts 'every' in each interface language
import test from "node:test";
import assert from "node:assert/strict";
import { everyInterval } from "../src/lib/gridContourLevels.js";
test("every / cada / a cada / tous les / كل, a point or a comma, and nothing else", () => {
  for (const t of ["every 5", "cada 5", "a cada 5", "tous les 5", "كل 5", " Every 5 "]) assert.equal(everyInterval(t), 5, t);
  assert.equal(everyInterval("cada 0,5"), 0.5);
  assert.equal(everyInterval("every 0.5"), 0.5);
  for (const t of ["", "5", "every", "every 0", "cada x", "10, 20, 30"]) assert.equal(everyInterval(t), null, t);
});
