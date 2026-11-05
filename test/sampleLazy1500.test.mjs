// TASKS.csv #1500 — surface samples: element order ranked once (same order as before), tooltip made when first read
import { test } from "node:test";
import assert from "node:assert/strict";
import { orderedElements, sampleUserData, surfaceSampleTip } from "../src/lib/viewer/sampleTip.js";

const KEY = ["Cu", "Au", "Ag", "Zn", "Pb", "Mo", "As", "Sb", "Ni", "Co", "Bi", "Te", "W", "Sn", "Hg", "Mn"];
function oldOrder(values, first = []) { // the comparator form it replaced
  const syms = Object.keys(values || {}).filter((s) => values[s] != null);
  const rank = (s) => { const f = first.indexOf(s); if (f >= 0) return f; const k = KEY.indexOf(s); return k >= 0 ? 100 + k : 1000 + syms.indexOf(s); };
  return syms.sort((a, b) => rank(a) - rank(b));
}

test("the same order as the comparator form, with and without a first element", () => {
  const all = ["Al", "Ag", "As", "Au", "Ba", "Be", "Bi", "Ca", "Cd", "Ce", "Co", "Cr", "Cs", "Cu", "Fe", "Ga", "Hg", "K", "La", "Mg", "Mn", "Mo", "Na", "Ni", "P", "Pb", "S", "Sb", "Sc", "Sn", "Sr", "Te", "Th", "Ti", "Tl", "U", "V", "W", "Y", "Zn", "Zr"];
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 200; k++) {
    const v = {}; for (const s of all.slice().sort(() => rnd() - 0.5)) if (rnd() > 0.2) v[s] = rnd() > 0.1 ? rnd() * 100 : null;
    const first = rnd() > 0.5 ? [all[Math.floor(rnd() * all.length)]] : [];
    assert.deepEqual(orderedElements(v, first), oldOrder(v, first));
  }
});

test("the tooltip is made on first read, once, and can still be replaced", () => {
  const row = { sample_id: "S1", medium: "soil", x: 1, y: 2, z: 3, values: { Cu: 120, Au: 0.01 } };
  const ud = sampleUserData(row, null, { Cu: "ppm", Au: "ppm" });
  assert.equal(ud.holeId, "");
  const desc = Object.getOwnPropertyDescriptor(ud, "tip");
  assert.equal(typeof desc.get, "function");
  const t1 = ud.tip;
  assert.equal(t1, surfaceSampleTip(row, { units: { Cu: "ppm", Au: "ppm" }, mapped: null }));
  assert.equal(ud.tip, t1);
  ud.tip = "changed"; assert.equal(ud.tip, "changed");
});
