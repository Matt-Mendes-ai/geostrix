// TASKS.csv #3014 (part a) — several elements in one estimate: a set of same-lattice models (params.set), a hard-boundary estimate keeping
// each block's domain (and saying "by <layer>" in its name), and the domain written to the block-model CSV. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { cellsFromColumns } from "../src/lib/estimationCells.js";
import { blockModelLattice } from "../src/lib/estimationMeta.js";
import { sameLattice } from "../src/lib/densityFromModel.js";
import { blockModelRows, blockModelCsvChunks } from "../src/lib/blockModelExport.js";
import { setChoices, setOthers, setRecord, newSetId, memberName, domainNameSuffix, trimLike, memberSummary, setMembersOf, MEMBER_OWN_KEYS, MAX_SET_ELEMENTS } from "../src/lib/estimateSet.js";

// four vertical holes on a 40 m square, a 2 m composite every 2 m; the upper half "ORE", the lower half "WASTE" (one composite with no code)
function points(valueOf, { skip = () => false } = {}) {
  const out = [];
  for (const [h, x, y] of [["A", 0, 0], ["B", 40, 0], ["C", 0, 40], ["D", 40, 40]]) {
    for (let z = -1; z > -60; z -= 2) {
      if (skip(h, z)) continue;
      const domain = h === "D" && z === -31 ? null : z > -30 ? "ORE" : "WASTE";
      out.push({ x, y, z, hole_id: h, value: valueOf(h, z), length: 2, from: -z - 1, to: -z + 1, domain });
    }
  }
  return out;
}
const bounds = { xmin: -10, xmax: 50, ymin: -10, ymax: 50, zmin: -60, zmax: 0 };
const opts = { bounds, cellSize: { dx: 10, dy: 10, dz: 5 }, method: "idw2", searchRadius: 60, minSamples: 1, maxSamples: 8, minHoles: 1, support: true };

test("a hard-boundary estimate keeps the domain each block took, the same as cells or as columns", () => {
  const pts = points((h, z) => (z > -30 ? 60 : 20));
  const o = { ...opts, restrictToDomain: true, noCodeAsDomain: true };
  const a = estimateBlockModel(pts, o).cells;
  const b = cellsFromColumns(estimateBlockModel(pts, { ...o, columns: true }).columns);
  assert.ok(a.length > 0);
  assert.deepEqual(b, a);
  const doms = new Set(a.map((c) => c.domain));
  assert.ok(doms.has("ORE") && doms.has("WASTE"), [...doms].join());
  for (const c of a) if (c.z > -25) assert.equal(c.domain, "ORE"); // nearest composite above the contact
  // without the restriction no block carries a domain
  for (const c of estimateBlockModel(pts, opts).cells) assert.equal("domain" in c, false);
});

test("members run on the same bounds and cell size are on one lattice, even with fewer samples", () => {
  const fe = estimateBlockModel(points((h, z) => 60 + z / 10), opts).cells;
  const si = estimateBlockModel(points((h, z) => 3 - z / 100, { skip: (h) => h === "D" }), opts).cells; // SiO2 not assayed in hole D
  const L1 = blockModelLattice({ cells: fe }), L2 = blockModelLattice({ cells: si });
  assert.ok(sameLattice(L1, L2));
  const keys = new Set(fe.map((c) => `${c.x},${c.y},${c.z}`));
  for (const c of si) assert.ok(keys.has(`${c.x},${c.y},${c.z}`)); // the member's blocks are the primary's blocks
  const set = setRecord("set-1", "Fe", ["SiO2"]);
  const mFe = { cells: fe, params: { set } }, mSi = { cells: si, params: { set } }, other = { cells: si, params: { set: { ...set, id: "set-2" } } };
  assert.deepEqual(setMembersOf(mFe, [mFe, mSi, other]), [mSi]);
  assert.deepEqual(setMembersOf({ cells: fe, params: {} }, [mFe, mSi]), []); // a single-element model: no set
  const shifted = { cells: si.map((c) => ({ ...c, x: c.x + 3 })), params: { set } }; // a model with that id on another grid drops out
  assert.deepEqual(setMembersOf(mFe, [shifted]), []);
});

test("set names, the domain suffix and the elements offered", () => {
  const set = setRecord("s", "Fe", ["SiO2", "Al2O3"]);
  assert.deepEqual(set, { id: "s", elements: ["Fe", "SiO2", "Al2O3"], primary: "Fe" });
  const base = "Fe estimate (idw2, 25x25x2m, r60m, by Lithology)";
  assert.equal(memberName(base, "Fe", "Fe", set), "Fe estimate (idw2, 25x25x2m, r60m, by Lithology) (set: Fe, SiO2, Al2O3)");
  assert.equal(memberName(base, "Fe", "SiO2", set), "SiO2 estimate (idw2, 25x25x2m, r60m, by Lithology) (set: Fe, SiO2, Al2O3)");
  assert.equal(memberName("Block 7 product", "Fe", "SiO2", set, true), "Block 7 product — SiO2 (set: Fe, SiO2, Al2O3)");
  assert.equal(memberName("Block 7 product", "Fe", "Fe", set, true), "Block 7 product (set: Fe, SiO2, Al2O3)");
  assert.equal(domainNameSuffix({ restrictToDomain: true, domain: "Lithology" }), ", by Lithology");
  assert.equal(domainNameSuffix({ restrictToDomain: false, domain: "Lithology" }), ""); // composites broken at the boundary only: no hard boundary
  assert.deepEqual(setChoices(["Fe", "SiO2", "Al2O3"], "SiO2"), ["Fe", "Al2O3"]);
  assert.deepEqual(setOthers(["Al2O3", "Fe", "P"], ["Fe", "SiO2", "Al2O3"], "Fe"), ["Al2O3"]); // the primary and an element no longer offered left out
  const many = Array.from({ length: 12 }, (_, i) => `E${i}`);
  assert.equal(setOthers(many, many, "E0").length, MAX_SET_ELEMENTS - 1);
  assert.match(newSetId(1700000000000, 0.5), /^set-[0-9a-z]+-[0-9a-z]+$/);
  assert.ok(MEMBER_OWN_KEYS.includes("capValue") && MEMBER_OWN_KEYS.includes("variogram") && !MEMBER_OWN_KEYS.includes("searchRadiusM"));
});

test("a member is cut as the primary was, and summarized by its volume-weighted mean", () => {
  const cells = [{ x: 0, y: 0, z: -5, dx: 10, dy: 10, dz: 10, value: 2 }, { x: 20, y: 0, z: -5, dx: 10, dy: 10, dz: 10, value: 4 }, { x: 0, y: 0, z: 15, dx: 10, dy: 10, dz: 10, value: 9 }];
  const t = trimLike(cells, { inArea: (x) => x < 10, groundAt: () => 0 });
  assert.deepEqual(t.cells.map((c) => c.value), [2]);
  assert.equal(t.dropped, 2);
  assert.equal(trimLike(cells, {}).dropped, 0);
  assert.equal(trimLike(cells, { groundAt: () => NaN }).dropped, 0); // outside the terrain nothing is known: nothing dropped
  const s = memberSummary("SiO2", "%", cells.slice(0, 2), 40);
  assert.deepEqual(s, { element: "SiO2", unit: "%", blocks: 2, composites: 40, mean: 3 });
});

test("the block-model CSV carries the domain, the same in both writers", () => {
  const cells = estimateBlockModel(points((h, z) => (z > -30 ? 60 : 20)), { ...opts, restrictToDomain: true, noCodeAsDomain: true }).cells;
  const model = { name: "Fe", cells, params: { element: "Fe", unit: "%" } };
  const rows = blockModelRows(model);
  assert.ok(rows.some((r) => r.DOMAIN === "ORE") && rows.some((r) => r.DOMAIN === "WASTE"));
  const text = [...blockModelCsvChunks(model)].join("\r\n");
  const head = text.split("\r\n")[0].split(",");
  assert.ok(head.includes("DOMAIN"));
  const lines = text.split("\r\n").slice(1).map((l) => l.split(","));
  const k = head.indexOf("DOMAIN");
  assert.deepEqual(lines.map((l) => l[k] || null), rows.map((r) => (r.DOMAIN == null ? null : String(r.DOMAIN))));
  // a model with no domain keeps its columns as before
  assert.equal([...blockModelCsvChunks({ ...model, cells: cells.map(({ domain, ...c }) => c) })].join("").split("\r\n")[0].includes("DOMAIN"), false);
});

test("the Estimation dialog runs the set on the primary's grid and search, and adds each member with the set", () => {
  const src = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(src, /runEstimation\("block", mp, \{ \.\.\.baseOpts/); // the members share the grid, search, trend and domain rule
  assert.match(src, /m\.params\.set = set/);
  assert.match(src, /onAddModel\(\{ name: memberName\(name, p0, m\.element, set, typed\)/);
  assert.match(src, /domainNameSuffix\(p\)/);
});
