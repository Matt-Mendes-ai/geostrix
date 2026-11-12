// TASKS.csv #2796 — Identify answered 'Nothing here' where the hover tooltip showed an interval: a click event's clientX / clientY are
// whole pixels (1206, 553) while the pointer events, and the hover, had (1206.44, 553.53); a thin tube at the far side of the view lay
// between the two. Identify now casts its ray from the press's own position.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clickPoint } from "../src/lib/viewer/identify.js";

test("the press's fractional position is used when it is the same click", () => {
  assert.deepEqual(clickPoint({ clientX: 1206, clientY: 553 }, { x: 1206.4417, y: 553.5264 }), { x: 1206.4417, y: 553.5264 });
  assert.deepEqual(clickPoint({ clientX: 1206, clientY: 553 }, { x: 1203.2, y: 553 }), { x: 1206, y: 553 }, "another press: the click's own point");
  assert.deepEqual(clickPoint({ clientX: 10, clientY: 20 }, null), { x: 10, y: 20 });
});

test("the Identify hook records the press while it is on and casts from it", () => {
  const s = readFileSync(new URL("../src/modules/viewer/useIdentify.js", import.meta.url), "utf8");
  assert.ok(s.includes('window.addEventListener("pointerdown", f, true);'));
  assert.ok(s.includes("const p = clickPoint(e, downRef.current);"));
  assert.ok(s.includes("const items = identifyAt(r, p.x, p.y);"));
});
