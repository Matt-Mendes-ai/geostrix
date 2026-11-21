// TASKS.csv #3930 — the "Let's begin a project!" dialog (#3888) stayed up over the page after a sample, a project or a recovery copy loaded under it, and its
// backdrop swallowed every click. It closes then; it does not while the user is inside its own import steps. SYNTHETIC inputs only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldCloseStart } from "../src/lib/startFlow.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3930 the rule: closes when the project fills or a sample is asked for, never while the dialog's own data steps are under way", () => {
  assert.equal(shouldCloseStart({ empty: true }), false, "an empty project: the dialog is what it is for");
  assert.equal(shouldCloseStart({ empty: false }), true, "a sample, a saved project or a recovery copy loaded");
  assert.equal(shouldCloseStart({ empty: true, sampleRequested: true }), true, "a sample was asked for: do not wait for it to finish loading");
  assert.equal(shouldCloseStart({ empty: false, engaged: true }), false, "files dropped in step 2 filled the project: that is the dialog's own work");
  assert.equal(shouldCloseStart({ empty: true, engaged: true, sampleRequested: true }), false);
  assert.equal(shouldCloseStart(), false);
});

test("#3930 wired: the dialog checks it when the project or the sample request changes, and its own imports mark it engaged first", () => {
  const d = read("../src/components/StartDialogs.jsx");
  assert.match(d, /shouldCloseStart\(\{ empty: projectIsEmpty, engaged: engaged\.current, sampleRequested: !!store\.sampleRequest \}\)\) onClose\?\.\(\); \}, \[projectIsEmpty, store\.sampleRequest\]\);/);
  for (const head of ["const sendFiles = (files) => { engaged.current = true;", "const onGroundFiles = async (files) => {\n    engaged.current = true;", "const pickCrs = async (code) => {\n    engaged.current = true;", "const makeGround = async (zoneEpsg = null) => {\n    engaged.current = true;"])
    assert.ok(d.includes(head), head);
});
