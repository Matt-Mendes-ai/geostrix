// TASKS.csv #3369 (#3195, Galore Creek review) — 'Model it' opened on the subcrop's nearest-hole outlines and proposed a stratigraphic pile of
// every code (intrusive phases and dykes included), its order voted by the borders half-way between holes. SYNTHETIC map (no Galore data).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { suggestPileOrder, mapRoleFromLog } from "../src/lib/pileOrder.js";
import { roleForLithology } from "../src/lib/layers.js";

// two square cells side by side, units V3 (west) and D1 (east), and bedding near their shared border dipping east (D1 the younger side)
const sq = (x0) => [[[x0, 0], [x0 + 500, 0], [x0 + 500, 500], [x0, 500], [x0, 0]]];
const layerOf = (extra = {}) => ({ geomType: "polygon", fields: ["unit"], features: [{ attributes: { unit: "V3" }, parts: sq(0) }, { attributes: { unit: "D1" }, parts: sq(500) }, { attributes: { unit: "i9a" }, parts: sq(1000) }], ...extra });
const bedding = [0, 100, 200, 300, 400].map((y) => ({ x: 480, y: y + 50, dip: 40, dipDir: 90 }));

test("a mapped layer's contacts vote; the nearest-hole outlines' borders do not", () => {
  const mapped = suggestPileOrder({ layer: layerOf(), field: "unit", bedding });
  const p = mapped.pairs.find((q) => [q.a, q.b].sort().join() === "D1,V3");
  assert.ok(p.weight > 0 && p.younger === "D1", "the bedding votes on a mapped contact");
  const outl = suggestPileOrder({ layer: layerOf({ subcropOutlines: true }), field: "unit", bedding, nearestHole: true });
  assert.ok(outl.pairs.length >= 2 && outl.pairs.every((q) => q.nearestHole && q.weight === 0 && q.younger == null), "every border listed, none voting");
  assert.ok(outl.units.every((u) => u.evidence !== "bedding"));
});

test("on the outlines each code starts on the role the logs give it", () => {
  assert.equal(mapRoleFromLog("dyke"), "intrusion");
  assert.equal(mapRoleFromLog("breccia"), "cross-cutting");
  assert.equal(mapRoleFromLog("cross-cutting"), "cross-cutting");
  assert.equal(mapRoleFromLog("overburden"), "other");
  assert.equal(mapRoleFromLog("ignore"), "other");
  assert.equal(mapRoleFromLog("stratigraphic"), null);
  const logRole = (u) => ({ D1: "dyke", I9A: "dyke" }[u.toUpperCase()] || roleForLithology(u));
  const s = suggestPileOrder({ layer: layerOf({ subcropOutlines: true }), field: "unit", nearestHole: true, roleOf: (u) => mapRoleFromLog(logRole(u)) });
  assert.deepEqual(s.roles, { V3: "stratigraphic", D1: "intrusion", i9a: "intrusion" });
  assert.deepEqual(s.order, ["V3"], "the intrusive codes leave the pile");
  // a name or description rule still comes first
  const b = suggestPileOrder({ layer: { ...layerOf(), features: [{ attributes: { unit: "BX" }, parts: sq(0) }, { attributes: { unit: "V3" }, parts: sq(500) }] }, field: "unit", roleOf: () => "intrusion" });
  assert.equal(b.roles.BX, "cross-cutting");
});

test("the pane defaults to a shown mapped layer, warns on the outlines and passes them through", () => {
  const src = fs.readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /polys\.find\(\(l\) => !derivedMap\(l\) && l\.visible !== false\)/);
  assert.match(src, /const nearestHole = !!layer\?\.subcropOutlines;/);
  assert.match(src, /suggestPileOrder\(\{[^}]*groundAt, nearestHole, roleOf: logRoleOf \}\)/);
  assert.match(src, /\{nearestHole && <div role="status"/);
  const sm = fs.readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.ok(!sm.includes("Model it can build from it"), "the outline notice no longer invites a model");
});
