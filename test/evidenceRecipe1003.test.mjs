// TASKS.csv #1003 — the Evidence overlay recipe is a project field (format v18): saved and read back as it was
import test from "node:test";
import assert from "node:assert/strict";
import { payloadFromFields, fieldsFromPayload, emptyFields, PROJECT_VERSION } from "../src/lib/projectFields.js";

test("#1003 evidenceOverlay round-trips through the project file; an old file opens with none", () => {
  const f = emptyFields();
  assert.equal(f.evidenceOverlay, null);
  f.evidenceOverlay = { layers: [{ key: "el:Au", kind: "element", ref: "Au", label: "Samples: Au (robust z)", shape: "increasing", low: 1, high: 5, field: "", value: "", reach: 300 }, { key: "dist:7", kind: "distance", ref: 7, label: "Distance to: Faults", shape: "decreasing", low: 0, high: 250, field: "TYPE", value: "thrust", reach: 300 }], operator: "gamma", gamma: 0.85, training: { source: "collars", layerId: "", symbol: "Au", min: "1" } };
  const file = JSON.parse(JSON.stringify(payloadFromFields(f)));
  assert.equal(file.version, PROJECT_VERSION);
  assert.deepEqual(fieldsFromPayload(file, "p.geostrix.json").evidenceOverlay, f.evidenceOverlay);
  const old = { ...file, version: 17 }; delete old.evidenceOverlay;
  assert.equal(fieldsFromPayload(old, "old.geostrix.json").evidenceOverlay, null);
});
