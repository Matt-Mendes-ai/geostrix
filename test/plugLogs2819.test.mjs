// TASKS.csv #2819 (split from #2724) — Model from map: a plug / stock body is checked against the unit's logged intercepts as #2663 does
// for sheets ('k of n logged intercepts lie inside the body'); the pane sends the logs for every body shape, not only sheets.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIntrusionBodies } from "../src/modules/viewer/intrusionRun.js";

const E0 = 500000, N0 = 6200000;
const terrain = { bbox: [E0 - 2000, N0 - 2000, E0 + 2000, N0 + 2000], gridW: 2, gridH: 2, elevations: new Float32Array([1000, 1000, 1000, 1000]) };
const sq = (x0, y0, s) => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]];
const layer = { name: "geology", features: [{ parts: [sq(E0, N0, 200)], attributes: { UNIT: "Kqm" } }], categories: [] };
// vertical holes: H1 in the middle of the 200 m stock, H2 100 m east of it, H3 in the middle but logging the unit below the 300 m base
const hole = (h, x, y, len = 400) => ({ hole_id: h, x, y, z: 1000, azimuth: 0, dip: 90, length: len });
const sv = (h, len = 400) => [{ hole_id: h, depth: 0, azimuth: 0, dip: 90 }, { hole_id: h, depth: len, azimuth: 0, dip: 90 }];
const collars = [hole("H1", E0 + 100, N0 + 100), hole("H2", E0 + 300, N0 + 100), hole("H3", E0 + 60, N0 + 60)];
const survey = [...sv("H1"), ...sv("H2"), ...sv("H3")];
const litho = [
  { hole_id: "H1", from: 5, to: 250, value: "QM" }, { hole_id: "H2", from: 20, to: 60, value: "QM" }, { hole_id: "H3", from: 320, to: 380, value: "QM" },
  { hole_id: "H1", from: 0, to: 5, value: "OB" }, { hole_id: "NOCOLLAR", from: 1, to: 9, value: "QM" },
];
function run(opts) {
  const surfaces = [], notices = [];
  buildIntrusionBodies({ layer, field: "UNIT", units: ["Kqm"], depthM: 300, wallDip: 90, flare: "out", ...opts }, {
    implicitGroupRef: { current: { add: () => {} } }, implicitMeshesRef: { current: {} }, originRef: { current: { x: E0, y: N0, z: 0 } },
    setImplicitSurfaces: (f) => surfaces.push(...f([])), setNotices: (f) => notices.push(...f([])), terrain, collars, survey, desurveyMethod: "minimumCurvature",
  });
  return { surfaces, notices: notices.map((n) => n.text || String(n)) };
}

test("a vertical-walled stock: 1 of 3 placed intercepts inside (the hole beside it and the one below its base are outside)", () => {
  const { surfaces, notices } = run({ logs: { codeUnit: { QM: "Kqm" }, litho } });
  assert.equal(surfaces.length, 1);
  const n = notices.find((t) => /^Against the logs/.test(t));
  assert.ok(n, notices.join(" | "));
  assert.match(n, /Kqm: 1 of 3 logged intercept\(s\) \(3 hole\(s\)\) lie inside the body\./);
  assert.match(n, /its walls, its depth or the outline do not fit the drilling there/);
  assert.doesNotMatch(n, /sheet|thickness/, "a plug has no sheet thickness");
});

test("a deeper stock takes in the intercept below the old base; no logs: no line, as before", () => {
  const { notices } = run({ depthM: 450, logs: { codeUnit: { QM: "Kqm" }, litho } });
  assert.match(notices.join(" "), /Kqm: 2 of 3 logged intercept\(s\)/);
  assert.ok(!run({ logs: null }).notices.some((t) => /^Against the logs/.test(t)));
  assert.ok(!run({ logs: { codeUnit: { XX: "Kqm" }, litho } }).notices.some((t) => /^Against the logs/.test(t)), "no logged code matched to the unit");
});

test("the pane sends the logs for every shape; a sheet still gets its own wording", () => {
  const m = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(m, /logs: lithoRows\?\.length \? \{ codeUnit, litho: lithoRows \} : null/);
  assert.doesNotMatch(m, /logs: bodyShape === "sheet"/);
  const sheet = run({ sheet: { dip: 89, dipDir: 90 }, logs: { codeUnit: { QM: "Kqm" }, litho } }).notices.find((t) => /^Against the logs/.test(t));
  assert.match(sheet, /lie inside the sheet/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["{unit}: {k} of {n} logged intercept(s) ({h} hole(s)) lie inside the body."] && d["Against the logs: {lines} An intercept outside the body says its walls, its depth or the outline do not fit the drilling there."], l);
  }
});
