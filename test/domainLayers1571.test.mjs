// TASKS.csv #1571 (review #1497, Lawyers) — custom layers as estimation / variogram domains; overlapping layers flagged; a cap per domain
import test from "node:test";
import assert from "node:assert/strict";
import { domainLayerChoices, overlapShare, domainOfInterval } from "../src/lib/domainLayers.js";
import { compositeDownhole } from "../src/lib/geochem.js";

const layers = {
  litho: [{ hole_id: "H1", from: 0, to: 10, value: "AND" }, { hole_id: "H1", from: 10, to: 20, value: "DAC" }],
  vein: [{ hole_id: "H1", from: 2, to: 6, value: "Vn1" }, { hole_id: "H1", from: 4, to: 8, value: "Vn2" }, { hole_id: "H1", from: 12, to: 13, value: "Vn3" }],
  geotech: [{ hole_id: "H1", from: 0, to: 10, value: "85" }, { hole_id: "H1", from: 10, to: 20, value: "60" }],
};
const custom = [{ id: "c1", name: "Min Domain", rows: [{ hole_id: "H1", from: 0, to: 10, value: "waste" }, { hole_id: "H1", from: 10, to: 20, value: "CC3" }] }, { id: "c2", name: "Mag susc", rows: [{ hole_id: "H1", from: 0, to: 10, value: 12.5 }, { hole_id: "H1", from: 10, to: 20, value: 30 }] }, { id: "c3", name: "Picks", rows: [{ hole_id: "H1", depth: 5, value: "x" }] }];

test("#1571 the choices: categorical built-in layers and categorical custom interval layers; numbers and points are not domains", () => {
  const c = domainLayerChoices(layers, custom);
  assert.deepEqual(c.map((x) => x.key), ["litho", "vein", "custom:c1"]);
  const md = c.find((x) => x.key === "custom:c1");
  assert.equal(md.label, "Min Domain"); assert.ok(md.custom); assert.equal(md.overlap, 0);
  assert.ok(c.find((x) => x.key === "vein").overlap > 0.6, "two of three vein intervals overlap");
  assert.equal(overlapShare(layers.litho), 0);
});

test("#1571 a cap per domain caps only that domain's composites", () => {
  const assays = [];
  for (let d = 0; d < 20; d += 2) assays.push({ hole_id: "H1", from: d, to: d + 2, values: { Au: d === 4 || d === 14 ? 50 : 1 } });
  const units = { Au: "ppm" };
  const dom = custom[0].rows;
  const none = compositeDownhole(assays, "Au", "ppm", units, { length: 2, domainRows: dom });
  const capped = compositeDownhole(assays, "Au", "ppm", units, { length: 2, domainRows: dom, capByDomain: { CC3: 10 } });
  const at = (list, f) => list.find((c) => c.from === f).avgGrade;
  assert.equal(at(none, 4), 50); assert.equal(at(none, 14), 50);
  assert.equal(at(capped, 4), 50, "waste: no cap of its own and no global cap");
  assert.equal(at(capped, 14), 10, "CC3: capped at 10");
  const both = compositeDownhole(assays, "Au", "ppm", units, { length: 2, domainRows: dom, capValue: 20, capByDomain: { CC3: 10 } });
  assert.equal(at(both, 4), 20, "waste falls back to the global cap"); assert.equal(at(both, 14), 10);
  const of = domainOfInterval(dom);
  assert.equal(of({ hole_id: "H1", from: 12, to: 14 }), "CC3"); assert.equal(of({ hole_id: "H2", from: 0, to: 1 }), null);
});
