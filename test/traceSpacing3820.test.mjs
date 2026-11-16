// TASKS.csv #3820 (Scottie Gold review) — 'Typical spacing' was measured between collar SITES (63 m; 120 m for the 'Contact' holes) while fans of holes from shared pads are
// 32-34 m apart where they cut the gold: Undrilled zones' default called 80 % covered where half the true spacing gives 40 %. Synthetic fans.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { traceSpacing, effectiveSpacing, SKIP_COLLAR_M } from "../src/lib/traceSpacing.js";
import { defaultCoverM } from "../src/lib/undrilledZones.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// pads 63 m apart on a grid; each pad drills three holes in a fan (azimuths 90 / 180 / 270 at dip 55) 200 m long, from one collar
function fans(padM = 63, n = 4) {
  const traces = new Map();
  let k = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (const az of [90, 180, 270]) {
    const a = (az * Math.PI) / 180, dip = (55 * Math.PI) / 180, pts = [];
    for (let md = 0; md <= 200; md += 4) pts.push({ x: i * padM + md * Math.cos(dip) * Math.sin(a), y: j * padM + md * Math.cos(dip) * Math.cos(a), z: 1000 - md * Math.sin(dip) });
    traces.set(`H${k++}`, pts);
  }
  return traces;
}

test("fans from shared pads: the spacing between the holes where they are is under the spacing of their pads", () => {
  const sp = traceSpacing(fans());
  assert.ok(sp, "found");
  assert.ok(sp.medianM > 5 && sp.medianM < 55, `holes ${sp.medianM} m apart against pads 63 m apart`);
  assert.equal(effectiveSpacing(63, sp.medianM), sp.medianM, "the smaller drives the defaults");
  assert.equal(effectiveSpacing(63, null), 63); assert.equal(effectiveSpacing(null, 33), 33); assert.equal(effectiveSpacing(null, null), null);
  // the default coverage distance follows: half the true spacing, not half the pads'
  assert.ok(defaultCoverM(sp.medianM) < defaultCoverM(63), `${defaultCoverM(sp.medianM)} < ${defaultCoverM(63)}`);
});

test("the fan's first metres (holes from one pad start together) say nothing of the spacing and are left out", () => {
  const stack = new Map([["A", [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }]], ["B", [{ x: 0, y: 0, z: 0 }, { x: 0, y: 40, z: -92 }]]]);
  const withSkip = traceSpacing(stack), noSkip = traceSpacing(stack, { skipM: 0 });
  assert.ok(withSkip.medianM > noSkip.medianM, `${withSkip.medianM} vs ${noSkip.medianM}`);
  assert.equal(SKIP_COLLAR_M, 20);
});

test("a subset is measured against EVERY hole, not as if the others were not there", () => {
  const t = new Map();
  // two lines of vertical holes 30 m apart (rows 'in' and 'out'); the 'in' holes are 120 m apart along their row
  for (let i = 0; i < 6; i++) { t.set(`in${i}`, [{ x: i * 120, y: 0, z: 0 }, { x: i * 120, y: 0, z: -200 }]); t.set(`out${i}`, [{ x: i * 120 + 60, y: 0, z: 0 }, { x: i * 120 + 60, y: 0, z: -200 }]); }
  const only = traceSpacing(new Map([...t].filter(([id]) => id.startsWith("in")))), against = traceSpacing(t, { ids: [...t.keys()].filter((id) => id.startsWith("in")) });
  assert.ok(Math.abs(only.medianM - 120) < 1, `alone ${only.medianM}`);
  assert.ok(Math.abs(against.medianM - 60) < 1, `against every hole ${against.medianM}`);
  assert.equal(traceSpacing(new Map([["A", [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -50 }]]])), null, "one hole: none");
});

test("wiring: Undrilled zones, the Evidence reach and the Planned holes' note say both spacings", () => {
  const u = read("../src/components/UndrilledZonesPane.jsx");
  assert.match(u, /const spacing = effectiveSpacing\(siteSpacing, holeSp\);/);
  assert.match(u, /defaultCoverM\(spacing\)/);
  assert.match(u, /Drill sites are typically \{s\} m apart, the holes \{h\} m apart where they are/);
  const e = read("../src/components/EvidenceOverlayPane.jsx");
  assert.match(e, /traceSpacing\(traces, \{ ids: areaHoleIds \? \[\.\.\.areaHoleIds\] : null \}\)/);
  assert.match(e, /const drillReach = reachSpacing > 0 \? Math\.round\(Math\.min\(1000, Math\.max\(50, 2 \* reachSpacing\)\)\)/);
  assert.match(read("../src/components/PlannedHoleParts.jsx"), /the holes themselves are \{h\} m apart where they are/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["Drill sites are typically {s} m apart, the holes {h} m apart where they are (the nearest other hole, in 3D); covered within starts at half the smaller."], l);
});
