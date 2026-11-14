// TASKS.csv #3114 — an earlier 'Topology check found n violation(s)' stayed on screen after a later check: the Check relationships handler now
// replaces its last notice (replaceNotices, matched by a tag), and the helper is generic for any handler whose result replaces its last one.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { replaceNotices, notice, errorNotice } from "../src/lib/notices.js";

test("replaceNotices: drops the earlier notices of the tag, keeps the rest in order, tags the new one", () => {
  const other = notice("Loaded 37 holes"), plain = "a plain string notice", err = new Error("boom");
  let list = [other, plain, err];
  list = replaceNotices(list, "topologyCheck", notice("Topology check found {n} violation(s)", { n: 3 }));
  assert.equal(list.length, 4); assert.equal(list[3].tag, "topologyCheck");
  list = replaceNotices(list, "topologyCheck", notice("Topology check passed"));
  assert.equal(list.length, 4, "the earlier check's notice is gone");
  assert.deepEqual(list.slice(0, 3), [other, plain, err], "the others untouched, in order");
  assert.match(list[3].text, /passed/);
  // another tag is left alone; several at once; a string and an Error become tagged notices
  list = replaceNotices(list, "otherCheck", ["one", errorNotice("two")]);
  assert.equal(list.filter((n) => n.tag === "otherCheck").length, 2);
  assert.equal(list.filter((n) => n.tag === "topologyCheck").length, 1);
  const e = replaceNotices([], "t", new Error("bad"))[0];
  assert.deepEqual([e.text, e.level, e.tag], ["bad", "error", "t"]);
  assert.deepEqual(replaceNotices(null, "t", null), []);
});

test("wiring: the four outcomes of Check relationships replace the last one", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal((v.match(/setNotices\(\(p\) => replaceNotices\(p, "topologyCheck", /g) || []).length, 4);
  for (const t of ["Nothing to check: none of the", "Topology check passed:", "Topology check found {violations} violation(s)", "Topology check failed: {message}"]) {
    const i = v.indexOf(t); assert.ok(i > 0, t);
    assert.match(v.slice(v.lastIndexOf("setNotices", i), i), /replaceNotices\(p, "topologyCheck", /, t);
  }
});
