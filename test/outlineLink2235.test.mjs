// TASKS.csv #2235 — 'Link into a solid': every section-outline name is offered with its count; a name on one section is listed but disabled
// with what links it, and the button says why it is disabled (lib/viewer/outlineLink.js).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { outlineLinkCandidates, outlineOptionText, linkableOutline, linkDisabledReason } from "../src/lib/viewer/outlineLink.js";

const sq = [[0, 0], [1, 0], [1, 1]];
const sec = (id, ...units) => ({ id, contacts: units.map((unit) => ({ kind: "outline", unit, points: sq })) });
const sections = [sec("A", "Ore", "Dyke"), sec("B", "Ore"), sec("C", "Ore", "Ore")];
const plans = [{ name: "Lens", drapeMode: "flat", elevation: 100, polylines: [sq] }, { name: "Lens", drapeMode: "flat", elevation: 120, polylines: [sq] }, { name: "Pod", drapeMode: "flat", elevation: 90, polylines: [sq] }];

test("every name with its count of sections (a section counted once), linkable first; one-section names marked single", () => {
  const c = outlineLinkCandidates(sections, plans);
  assert.deepEqual(c, [
    { name: "Lens", sections: 2, plans: true },
    { name: "Ore", sections: 3 },
    { name: "Dyke", sections: 1, single: true },
    { name: "Pod", sections: 1, plans: true, single: true },
  ]);
  assert.equal(linkableOutline(c, "Ore"), true);
  assert.equal(linkableOutline(c, "Dyke"), false);
  assert.deepEqual(outlineLinkCandidates([], []), []);
  // a contact with too few points or no name does not count; a name on sections is not counted again from plans
  assert.deepEqual(outlineLinkCandidates([{ id: "X", contacts: [{ kind: "outline", unit: "Q", points: [[0, 0], [1, 1]] }, { kind: "outline", points: sq }] }], []), []);
  assert.equal(outlineLinkCandidates([sec("A", "Lens")], plans).find((o) => o.name === "Lens").plans, undefined);
});

test("the picker text and the disabled reason", () => {
  const c = outlineLinkCandidates(sections, plans);
  assert.equal(outlineOptionText(c[1]), "Ore (3 sections)");
  assert.equal(outlineOptionText(c[0]), "Lens (2 level plans)");
  assert.equal(outlineOptionText(c[2]), "Dyke: on 1 section, draw it on a second section to link");
  assert.equal(outlineOptionText(c[3]), "Pod: on 1 level plan, draw it on a second to link");
  assert.equal(linkDisabledReason(c, "Ore"), "");
  assert.match(linkDisabledReason(c, "Dyke"), /"Dyke" is on one section only/);
  assert.match(linkDisabledReason(c, ""), /Choose an outline on two or more sections/);
  assert.match(linkDisabledReason([], ""), /Draw an outline \(closed, for a solid\) with the same name on two or more cross-sections first/);
});

test("wiring: ViewerModule's picker lists every name, disables single ones, and the button carries the reason", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const outlineNames = useMemo\(\(\) => outlineLinkCandidates\(sections, boundaries\), \[sections, boundaries\]\);/);
  assert.match(v, /<option key=\{o\.name\} value=\{o\.name\} disabled=\{!!o\.single\}>\{outlineOptionText\(o\)\}<\/option>/);
  assert.match(v, /disabled=\{!linkableOutline\(outlineNames, wireframeName\)\} title=\{linkDisabledReason\(outlineNames, wireframeName\) \|\| undefined\}/);
});
