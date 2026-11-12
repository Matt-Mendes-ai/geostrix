// TASKS.csv #2793 (split from #2657) — 'Zoom the plan to' on each Surface Geology map-layer card: it switches to Maps and asks the plan to
// frame the layer; the plan mounts after the switch, so lib/planZoom.js keeps the request a few seconds for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("a request made before the plan mounts is applied when it mounts, once", async () => {
  const events = [];
  globalThis.window = { dispatchEvent: (e) => events.push(e), addEventListener() {}, removeEventListener() {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const src = readFileSync(new URL("../src/lib/planZoom.js", import.meta.url), "utf8");
  assert.match(src, /let pending = null; \/\/ \{ bbox, at \}/);
  assert.match(src, /if \(pending && Date\.now\(\) - pending\.at < PENDING_MS\) \{ const b = pending\.bbox; pending = null; ref\.current\(b\); \}/);
  assert.match(src, /const on = \(e\) => \{ pending = null; ref\.current\(e\.detail\.bbox\); \};/);
  const { requestPlanZoom } = await import("../src/lib/planZoom.js");
  requestPlanZoom([0, 0, 10, 10]);
  assert.equal(events.length, 1);
  requestPlanZoom([0, NaN, 1, 1]); // not a box: nothing asked
  assert.equal(events.length, 1);
});

test("each map-layer card with a box has the crosshair: to Maps, then the zoom", () => {
  const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(s, /\{Array\.isArray\(l\.bbox\) && l\.bbox\.every\(Number\.isFinite\) && <Crosshair role="button"/);
  assert.match(s, /aria-label=\{tr\("Zoom the plan to \\"\{name\}\\"", \{ name: l\.name \}\)\}[^]*?onClick=\{\(\) => \{ goToModule\("maps"\); requestPlanZoom\(l\.bbox\); \}\}/);
});
