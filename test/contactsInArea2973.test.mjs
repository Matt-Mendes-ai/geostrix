// TASKS.csv #2973 (WA iron review) — Model from map's logged-contact count says how many are in holes collared inside the map's area
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contactsInArea } from "../src/lib/mapGroundCount.js";

test("contacts split by their hole's collar inside the map layer's box; a hole with no collar counts as outside", () => {
  const collars = [{ hole_id: "A", x: 10, y: 10 }, { hole_id: "B", x: 90, y: 90 }, { hole_id: "C", x: 500, y: 10 }];
  const contacts = [{ hole_id: "A" }, { hole_id: "A" }, { hole_id: "B" }, { hole_id: "C" }, { hole_id: "X" }];
  assert.deepEqual(contactsInArea(contacts, collars, [0, 0, 100, 100]), { inside: 3, insideHoles: 2, outside: 2 });
  assert.deepEqual(contactsInArea([], collars, [0, 0, 100, 100]), { inside: 0, insideHoles: 0, outside: 0 });
});

test("the pane says it beside the field-wide count", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /contactsInArea\(holePreview\.contacts, storeCollars, layer\.bbox\)/);
  assert.match(p, /tr\("\{k\} of them in \{hh\} hole\(s\) collared inside the map's area; \{o\} in holes outside it \(the run uses them all\)\."/);
});
