// TASKS.csv #2015 (review #2013, Import) — a survey sheet that states its north through corrected azimuth columns (MX Deposit /
// acQuire: azimuth, azimuth_corrected_tn, azimuth_corrected_gn, instrument) was committed as grid north 'the file does not say'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectAzimuthRef } from "../src/lib/azimuthRef.js";
const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const H = ["hole_id", "depth", "azimuth", "azimuth_corrected_tn", "azimuth_corrected_gn", "dip", "instrument"];
const row = (az, tn, gn, inst = "gyro") => ({ hole_id: "TF24-126", depth: 10, azimuth: az, azimuth_corrected_tn: tn, azimuth_corrected_gn: gn, dip: -60, instrument: inst });

test("Woodjam's sheet: the grid column is empty, the true-north one filled -> true north, read from that column", () => {
  const d = detectAzimuthRef(H, [row(120, 120, ""), row(121, 121, "", "compass")]);
  assert.deepEqual(d, { ref: "true", col: "azimuth_corrected_tn", mixed: false, azimuthCol: "azimuth_corrected_tn" });
});
test("a filled grid column wins and is read as grid north", () => {
  const d = detectAzimuthRef(H, [row(120, 120, 121.3), row(121, 121, 122.3)]);
  assert.equal(d.ref, "grid"); assert.equal(d.azimuthCol, "azimuth_corrected_gn");
});
test("a corrected column filled on some rows only is a mix: the dialog asks", () => {
  const d = detectAzimuthRef(H, [row(120, 120, 121.3), row(121, 121, "")]);
  assert.equal(d.mixed, true); assert.equal(d.ref, null);
});
test("gyros only, no corrected column: a true-north hint (asked, not converted unseen); a compass among them says nothing", () => {
  const h = ["hole_id", "depth", "azimuth", "dip", "instrument"];
  assert.deepEqual(detectAzimuthRef(h, [{ instrument: "Gyro" }, { instrument: "north-seeking gyro" }]), { ref: "true", col: "instrument", mixed: false, hint: true });
  // TASKS.csv #3209 — widened deliberately: a gyro and a compass in one file read different norths, so the dialog asks (it said nothing)
  assert.deepEqual(detectAzimuthRef(h, [{ instrument: "gyro" }, { instrument: "compass" }]), { ref: null, col: "instrument", mixed: true, hint: true, tools: true });
  assert.equal(detectAzimuthRef(["hole_id", "depth", "azimuth", "dip"], [{}]), null); // nothing stated: as before
});
test("an AZIMUTHTYPE column still decides first (#1647)", () => {
  assert.equal(detectAzimuthRef([...H, "AZIMUTHTYPE"], [{ ...row(1, 1, 2), AZIMUTHTYPE: "Grid" }]).col, "AZIMUTHTYPE");
});
test("wired: the corrected column is mapped, a hint opens the dialog, the notice names the column", () => {
  assert.equal((p.match(/azColFor\(target, headers, (data|rows), /g) || []).length, 3);
  assert.match(p, /!azDetected\.hint( && !azDetected\.also)?\)/); // also: #2154
  assert.match(p, /f\.key === "azimuth" && azColPicked && mapping\.azimuth === azColPicked/); // still committed unseen (the live run opened the dialog without it)
  assert.match(p, /tr\(" Azimuths read from the \{col\} column \(\{north\}\)\."/);
});
