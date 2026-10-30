// TASKS.csv #1142 — the geoML run survives its panel: progress and Cancel live outside it, and a long quiet step says so.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beginRun, updateRun, endRun, cancelRun, getRun, getRunHistory, subscribeRun, quietFor, formatElapsed } from "../src/lib/geomlRun.js";

test("#1142 a run is held outside the panel: subscribers come and go, the run and its Cancel stay", () => {
  const ctrl = new AbortController();
  let seen = 0;
  const off = subscribeRun(() => seen++);
  beginRun("VCL (stationary)", ctrl, "Starting", 1000);
  off(); // the panel closes: another pane was opened
  updateRun({ progress: 0.5, message: "Training", elapsed: 90 }, 2000);
  assert.equal(seen, 1); // the closed panel hears nothing
  assert.equal(getRun().progress, 0.5); // ...and a reopened one reads the run where it is
  assert.equal(getRun().message, "Training");
  assert.equal(cancelRun("Cancelling"), true); // from the status bar, with the panel closed
  assert.equal(ctrl.signal.aborted, true);
  assert.equal(getRun().cancelling, true);
  endRun({ label: "VCL", note: "done", secs: 90 });
  assert.equal(getRun(), null);
  assert.equal(getRunHistory()[0].label, "VCL");
  assert.equal(cancelRun(), false); // nothing to cancel
});

test("#1142 quiet time: only a real change of progress or message restarts it, not the elapsed tick", () => {
  beginRun("x", new AbortController(), "Predicting the block model", 0);
  updateRun({ progress: 0.85, message: "Predicting", elapsed: 10 }, 10_000);
  updateRun({ progress: 0.85, message: "Predicting", elapsed: 3700 }, 3_700_000);
  assert.equal(Math.round(quietFor(getRun(), 3_700_000)), 3690);
  updateRun({ progress: 0.9 }, 3_800_000);
  assert.equal(quietFor(getRun(), 3_800_000), 0);
  endRun();
  assert.equal(quietFor(null), 0);
});

test("#1142 elapsed time reads as a person would say it", () => {
  assert.equal(formatElapsed(45), "45 s");
  assert.equal(formatElapsed(725), "12 min 05 s");
  assert.equal(formatElapsed(3724), "1 h 02 min");
  assert.equal(formatElapsed(undefined), "0 s");
});

test("#1142 the panel keeps nothing of the run in its own state, reports to the status bar, and no longer promises a minute", () => {
  const s = readFileSync(new URL("../src/components/PredictivePanel.jsx", import.meta.url), "utf8");
  assert.ok(!/const \[job, setJob\]/.test(s));
  assert.match(s, /useSyncExternalStore\(subscribeRun, getRun\)/);
  assert.match(s, /setTaskProgress\(\{ label: statusLabel, pct: .*onCancel/);
  assert.ok(!s.includes("takes about a minute"));
});
