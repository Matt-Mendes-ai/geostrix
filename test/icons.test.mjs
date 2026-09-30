// TASKS.csv #445 step 4 — memoised icons: skip a re-render only when every prop is the same, comparing `style`
// by value (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { memoIcon, Trash2 } from "../src/components/icons.js";

test("#445 memoised icon props comparison", () => {
  const same = Trash2.compare; // React.memo keeps the comparison function here
  assert.equal(typeof same, "function");
  assert.equal(same({ size: 12 }, { size: 12 }), true);
  assert.equal(same({ size: 12, style: { color: "red", flexShrink: 0 } }, { size: 12, style: { color: "red", flexShrink: 0 } }), true); // a new but equal inline style
  assert.equal(same({ size: 12, style: { color: "red" } }, { size: 12, style: { color: "blue" } }), false);
  assert.equal(same({ size: 12, style: { color: "red" } }, { size: 12, style: { color: "red", cursor: "pointer" } }), false);
  assert.equal(same({ size: 12 }, { size: 14 }), false);
  assert.equal(same({ size: 12 }, { size: 12, color: "#000" }), false);
  const onClick = () => {};
  assert.equal(same({ onClick }, { onClick }), true);
  assert.equal(same({ onClick }, { onClick: () => {} }), false); // a new handler still re-renders (it could close over new state)
  assert.equal(typeof memoIcon, "function");
});
