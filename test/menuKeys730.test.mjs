// TASKS.csv #730 — popup-menu keys: arrows wrap, Home/End jump, other keys are left alone.
import test from "node:test";
import assert from "node:assert/strict";
import { nextMenuIndex } from "../src/lib/useMenuKeys.js";

test("arrow, Home and End movement between menu items", () => {
  assert.equal(nextMenuIndex("ArrowDown", -1, 4), 0);
  assert.equal(nextMenuIndex("ArrowDown", 3, 4), 0);
  assert.equal(nextMenuIndex("ArrowUp", 0, 4), 3);
  assert.equal(nextMenuIndex("ArrowUp", -1, 4), 3);
  assert.equal(nextMenuIndex("Home", 2, 4), 0);
  assert.equal(nextMenuIndex("End", 0, 4), 3);
  assert.equal(nextMenuIndex("a", 1, 4), -1);
  assert.equal(nextMenuIndex("ArrowDown", -1, 0), -1);
});
