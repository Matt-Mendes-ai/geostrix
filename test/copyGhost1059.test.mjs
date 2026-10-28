// TASKS.csv #1059 — copy a neighbouring section's string onto this section
import { test } from "node:test";
import assert from "node:assert/strict";
import { ghostStrings, copyGhostString } from "../src/lib/sectionDigitise.js";

const prev = { id: "a", name: "6200N", ax: 1000, ay: 6200, bx: 1400, by: 6200, contacts: [{ id: "o1", unit: "VeinA", kind: "outline", isUpperContact: false, color: "#9b6bd3", points: [
  { l: 100, x: 1100, y: 6200, z: 900, tie: true, hole_id: "DH1", md: 50, snap: "trace" }, { l: 140, x: 1140, y: 6200, z: 900 }, { l: 140, x: 1140, y: 6200, z: 860 }] }] };
const cur = { id: "b", name: "6300N", ax: 1000, ay: 6300, bx: 1400, by: 6300 };

test("#1059 a ghost outline copies onto this section with its name, kind, order and tie", () => {
  const [g] = ghostStrings(cur, [prev, cur]);
  const st = g.strings[0];
  assert.equal(st.kind, "outline");
  const c = copyGhostString(st, cur, "new1");
  assert.equal(c.id, "new1");
  assert.deepEqual([c.unit, c.kind, c.isUpperContact, c.color], ["VeinA", "outline", false, "#9b6bd3"]);
  assert.deepEqual(c.points.map((p) => [p.l, p.z, p.x, p.y]), [[100, 900, 1100, 6300], [140, 900, 1140, 6300], [140, 860, 1140, 6300]]);
  assert.deepEqual(c.points.map((p) => !!p.tie), [true, false, false]);
  assert.ok(c.points.every((p) => p.hole_id === undefined && p.snap === undefined)); // the other section's hole snaps stay behind
});

test("#1059 an older contact (no kind) copies as an upper contact", () => {
  const old = { ...prev, contacts: [{ id: "c", unit: "DACT", isUpperContact: true, points: prev.contacts[0].points }] };
  const c = copyGhostString(ghostStrings(cur, [old])[0].strings[0], cur);
  assert.deepEqual([c.kind, c.isUpperContact], ["contact", true]);
});
