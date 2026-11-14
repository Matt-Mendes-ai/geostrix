// TASKS.csv #1647 (review #1645, Copley) — a file's stated north (AZIMUTHTYPE = True) is read, not assumed to be grid
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectAzimuthRef } from "../src/lib/azimuthRef.js";

test("acQuire's AZIMUTHTYPE and other spellings", () => {
  const rows = [{ AZIMUTHTYPE: "True" }, { AZIMUTHTYPE: "True" }];
  assert.deepEqual(detectAzimuthRef(["HOLEID", "DEPTH", "AZIMUTH", "DIP", "AZIMUTHTYPE"], rows), { ref: "true", col: "AZIMUTHTYPE", mixed: false });
  assert.equal(detectAzimuthRef(["North_Ref"], [{ North_Ref: "MN" }]).ref, "magnetic");
  assert.equal(detectAzimuthRef(["az_type"], [{ az_type: "grid" }, { az_type: "" }]).ref, "grid");
});

test("a mix of norths asks; no column or no value it knows gives null", () => {
  assert.deepEqual(detectAzimuthRef(["AZIMUTHTYPE"], [{ AZIMUTHTYPE: "True" }, { AZIMUTHTYPE: "Magnetic" }]), { ref: null, col: "AZIMUTHTYPE", mixed: true });
  assert.equal(detectAzimuthRef(["HOLEID", "AZIMUTH"], [{ AZIMUTH: 120 }]), null);
  assert.equal(detectAzimuthRef(["AZIMUTHTYPE"], [{ AZIMUTHTYPE: "Gyro" }]), null);
});

test("the import pre-sets the dialog, converts a true-north file unseen, asks for magnetic or mixed, and says when it assumed grid", () => {
  const src = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.equal(src.split("...azRefFor(target, headers,").length - 1, 3, "single-file, sample and queue paths");
  assert.ok(src.includes('const azOk = !azDetected || (!azDetected.mixed && azDetected.ref !== "magnetic" && !azDetected.hint && !azDetected.also);') /* hint: #2015; also: #2154 */);
  assert.ok(src.includes("&& dipsAgree && azOk && !otherCodes;")); // !otherCodes: #2893
  assert.ok(src.includes("unseen && !azimuthRef && !azimuthGridEpsg ? tr(\" Azimuths taken as grid north"));
});
