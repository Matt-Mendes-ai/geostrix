// TASKS.csv #3209 (#3195, Galore Creek) — in a multi-file drop a gyro survey went in as grid north unasked: its method column 'SURVTYPE' (CHAMPGYRO)
// was not read as the instrument, and magnetic tools were never a reason to ask. Synthetic survey rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { detectAzimuthRef } from "../src/lib/azimuthRef.js";

const H = ["HOLE_ID", "DEPTH", "AZIMUTH", "DIP", "SURVTYPE"];
const st = (tools) => tools.map((t, i) => ({ HOLE_ID: "SY-1", DEPTH: String(i * 30), AZIMUTH: "45", DIP: "-60", SURVTYPE: t }));

test("a SURVTYPE of gyros is the gyro hint (true north, asked)", () => {
  assert.deepEqual(detectAzimuthRef(H, st(["CHAMPGYRO", "CHAMPGYRO"])), { ref: "true", col: "SURVTYPE", mixed: false, hint: true });
  assert.deepEqual(detectAzimuthRef(["HOLE_ID", "DEPTH", "AZIMUTH", "DIP", "Survey_Method"], st(["Reflex Gyro"]).map((r) => ({ ...r, Survey_Method: r.SURVTYPE }))).ref, "true", "a gyro word wins over 'Reflex'");
});

test("magnetic tools are a hint of magnetic north; gyro and magnetic tools together are asked", () => {
  assert.deepEqual(detectAzimuthRef(H, st(["Reflex EZ-Shot", "multishot"])), { ref: "magnetic", col: "SURVTYPE", mixed: false, hint: true });
  const mix = detectAzimuthRef(H, st(["CHAMPGYRO", "Reflex EZ-Shot"]));
  assert.equal(mix.ref, null); assert.equal(mix.mixed, true); assert.equal(mix.tools, true);
  assert.equal(detectAzimuthRef(H, st(["unknown tool"])), null, "a tool nobody can read says nothing");
});

test("the queue stops on such a survey, and the dialog says why", () => {
  const u = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /const azOk = !azDetected \|\| \(!azDetected\.mixed && azDetected\.ref !== "magnetic" && !azDetected\.hint/, "a hint or a mix is never committed unseen (#2015)");
  assert.match(u, /if \(d\?\.tools && !d\.ref\) return \{ azimuthToolsCol: d\.col \}/);
  const m = fs.readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /names both gyro and magnetic tools/);
});
