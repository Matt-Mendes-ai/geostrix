// TASKS.csv #1663 (review #1646, Kodiak) — downhole rows imported with no collars at all say so
import test from "node:test";
import assert from "node:assert/strict";
import { importCheckSummary } from "../src/lib/dataQC.js";

test("no collars: one line with the hole count and examples", () => {
  const rows = [{ hole_id: "AXE-23-001", from: 0, to: 2 }, { hole_id: "AXE-23-001", from: 2, to: 4 }, { hole_id: "AXE-23-002", from: 0, to: 3 }];
  const msg = importCheckSummary(rows, [], [], "assay rows");
  assert.match(msg, /^No collars are loaded, so these assay rows for 2 hole\(s\) \(AXE-23-001, AXE-23-002\) cannot be drawn yet/);
});

test("with collars the old checks are unchanged", () => {
  assert.equal(importCheckSummary([{ hole_id: "A", from: 0, to: 1 }], [{ hole_id: "A", length: 10 }], [], "rows"), "");
  assert.match(importCheckSummary([{ hole_id: "B", from: 0, to: 1 }], [{ hole_id: "A", length: 10 }], [], "rows"), /1 hole id\(s\) with no collar/);
});
