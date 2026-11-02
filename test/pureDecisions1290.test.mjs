// TASKS.csv #1290 — the surface's time stamp (#1169), the layer chip's look (#1252) and a false placeholder (#1165), by behaviour
import test from "node:test";
import assert from "node:assert/strict";
import { surfaceMadeAt, chipLook } from "../src/lib/viewer/modelHelpers.js";
import { t } from "../src/lib/i18n.js";

test("#1169 each tool's time field is read; a missing or broken one is null, never Invalid Date", () => {
  assert.equal(surfaceMadeAt({ generatedAt: "2026-01-02T03:04:05Z" }).toISOString(), "2026-01-02T03:04:05.000Z");
  assert.equal(surfaceMadeAt({ builtAt: "2026-02-02T00:00:00Z" }).getUTCMonth(), 1);
  assert.equal(surfaceMadeAt({ importedAt: "2026-03-02T00:00:00Z" }).getUTCMonth(), 2);
  assert.equal(surfaceMadeAt({ generatedAt: "2026-01-02T00:00:00Z", builtAt: "2026-02-02T00:00:00Z" }).getUTCMonth(), 0);
  assert.equal(surfaceMadeAt({}), null);
  assert.equal(surfaceMadeAt(null), null);
  assert.equal(surfaceMadeAt({ generatedAt: "not a date" }), null);
});

test("#1252 a chip takes the legend editor's colour and label over the layer's own", () => {
  const meta = { colorFn: () => "#layer", nameFn: (v) => `name ${v}` };
  assert.deepEqual(chipLook("A", meta, "litho", (k, v) => `${k}:${v}:colour`, (k, v) => `${k}:${v}:label`), { color: "litho:A:colour", label: "litho:A:label" });
  assert.deepEqual(chipLook("A", meta, "litho"), { color: "#layer", label: "name A" });
  assert.deepEqual(chipLook("A", { nameFn: () => "" }, "litho"), { color: "#55606e", label: "A" });
  assert.deepEqual(chipLook("A", {}, "litho"), { color: "#55606e", label: "A" });
});

test("#1165 a false placeholder prints nothing, not the word; other values are unchanged", () => {
  assert.equal(t("{n} blocks{v}", { n: 5, v: false }), "5 blocks");
  assert.equal(t("{n} of {m}", { n: 0, m: "" }), "0 of ");
  assert.equal(t("{a}", { a: null }), "null");
  assert.equal(t("{missing}", {}), "{missing}");
});
