// TASKS.csv #2240 — a numeric model evaluated onto the holes is offered in Downhole logs even after the store drops the 'numeric' flag
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logVsModel } from "../src/lib/downholeLogs.js";

const pane = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");

test("the filter takes a modelled row with a number, flag or not; text (categorical) rows are not numeric models", () => {
  assert.ok(pane.includes('r.modelled && (r.numeric || (typeof r.value === "number" && Number.isFinite(r.value)))'));
  const keep = (l) => (l.rows || []).some((r) => r.modelled && (r.numeric || (typeof r.value === "number" && Number.isFinite(r.value))));
  assert.equal(keep({ rows: [{ hole_id: "A", from: 0, to: 2, value: 1.4, modelled: true, modelColor: "#fff" }] }), true, "the store copy, no 'numeric'");
  assert.equal(keep({ rows: [{ hole_id: "A", from: 0, to: 2, value: "SER", modelled: true }] }), false);
  assert.equal(keep({ rows: [{ hole_id: "A", from: 0, to: 2, value: 3 }] }), false, "a logged layer is not a model");
});

test("logVsModel pairs a log with such a layer's rows", () => {
  const log = [{ hole_id: "A", from: 0, to: 2, values: { RQD: 80 } }, { hole_id: "A", from: 2, to: 4, values: { RQD: 40 } }, { hole_id: "A", from: 4, to: 6, values: { RQD: 20 } }];
  const model = [{ hole_id: "A", from: 0, to: 2, value: 0.2, modelled: true }, { hole_id: "A", from: 2, to: 4, value: 1.1, modelled: true }, { hole_id: "A", from: 4, to: 6, value: 2.5, modelled: true }];
  const r = logVsModel(log, "RQD", model);
  assert.ok(r && r.n === 3, JSON.stringify(r).slice(0, 200));
});
