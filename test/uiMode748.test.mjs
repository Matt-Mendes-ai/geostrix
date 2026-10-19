// TASKS.csv #748 — the Simple / Advanced default: fresh installs start Simple, existing users keep Advanced
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialUiMode, saveUiMode, UI_MODE_KEY } from "../src/lib/uiMode.js";

const store = (obj = {}) => { const m = new Map(Object.entries(obj)); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test("fresh install -> Simple; a computer that has used GeoStrix -> Advanced; a saved choice wins", () => {
  assert.equal(initialUiMode(store()), "simple");
  assert.equal(initialUiMode(store({ "geostrix-sidebar-width": "300" })), "advanced");
  assert.equal(initialUiMode(store({ "geox-autosave": "x" })), "advanced");
  assert.equal(initialUiMode(store({ "geostrix-sidebar-width": "300", [UI_MODE_KEY]: "simple" })), "simple");
  const s = store(); saveUiMode("advanced", s); assert.equal(initialUiMode(s), "advanced");
  assert.equal(initialUiMode({ getItem: () => { throw new Error("blocked"); } }), "advanced"); // storage unavailable
});
