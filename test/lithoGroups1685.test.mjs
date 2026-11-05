// TASKS.csv #1685 (review #1645, Copley) — a lithology code belongs to at most one litho group
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupOverlaps, groupOfCode, withGroupCodes } from "../src/lib/lithoGroups.js";

const groups = [
  { id: "a", name: "Volcanic host", codes: ["VOLC", "RHYL", "TFF", "ANDS"] },
  { id: "b", name: "Intrusive", codes: ["DIOR", "IFGD"] },
];

test("#1685 adding VOLC to Intrusive moves it out of Volcanic host; the other groups are untouched objects", () => {
  const next = withGroupCodes(groups, "b", ["DIOR", "IFGD", "VOLC"]);
  assert.deepEqual(next.map((g) => g.codes), [["RHYL", "TFF", "ANDS"], ["DIOR", "IFGD", "VOLC"]]);
  assert.deepEqual(groupOverlaps(next), []);
  const again = withGroupCodes(next, "b", ["DIOR", "IFGD"]);
  assert.ok(again[0] === next[0], "a group that loses nothing is the same object");
  assert.deepEqual(groupOverlaps(groups), []);
  assert.equal(groupOfCode(groups, "VOLC").name, "Volcanic host");
  assert.equal(groupOfCode(groups, "VOLC", "a"), null, "not the group being edited");
  assert.equal(groupOfCode(groups, "QZ"), null);
});

test("#1685 a saved project's overlap is reported per code with the groups that share it", () => {
  const slipped = [groups[0], { ...groups[1], codes: ["DIOR", "IFGD", "VOLC", "VOLC"] }];
  assert.deepEqual(groupOverlaps(slipped), [{ code: "VOLC", groups: ["Volcanic host", "Intrusive"] }]);
  assert.deepEqual(groupOverlaps([]), []);
});

test("#1685 the store strips a group's new codes from the other groups, and the chips say where a code already is", () => {
  const s = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("withGroupCodes(p, id, patch.codes)"));
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.ok(m.includes("groupOverlaps(lithoGroups)") && m.includes('tr("In \\"{group}\\" — click to move it here", { group: elsewhere.name })'));
});
