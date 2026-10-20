// TASKS.csv #739 — notice severity: explicit level wins, an Error instance is an error whatever its wording,
// and plain strings fall back to the wording test.
import test from "node:test";
import assert from "node:assert/strict";
import { noticeText, noticeLevel, errorNotice, infoNotice } from "../src/lib/notices.js";

test("severity of explicit notices, Error instances and plain strings", () => {
  const thrown = new Error("no block is both below the ground and within 150 m of a sample.");
  assert.equal(noticeLevel(thrown), "error");
  assert.equal(noticeText(thrown), thrown.message);
  assert.equal(noticeLevel(errorNotice("Loaded 37 holes")), "error");
  assert.equal(noticeLevel(infoNotice("Export failed: retried")), "info");
  assert.equal(noticeLevel("Couldn't read the file."), "error");
  assert.equal(noticeLevel("Loaded 37 holes."), "info");
  assert.equal(noticeText(null), "");
});
