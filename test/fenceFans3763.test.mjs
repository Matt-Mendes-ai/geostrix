// TASKS.csv #3763 (Scottie Gold review) — Fence series on fan drilling: with no drill lines the azimuth fell back to the bearing between neighbouring
// collars (70°; 22° for the 36 'Contact' holes), which cut across holes drilled 80-120°. Now the commonest hole azimuth, said, and the buffer's
// "drill spacing" is a "pad spacing" when holes share pads. Synthetic fans from 57 pads on rough ground.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { commonestHoleAzimuth, holeAzimuthOf, HOLE_AZ_MIN_SHARE } from "../src/lib/viewer/holeAzimuth.js";
import { drillLineGeometry } from "../src/modules/viewer/drillLines.js";
import { drillSiteSpacing } from "../src/lib/drillSpacing.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// 57 pads scattered over a hillside (no lines), 1-2 holes each; 53 % of the holes drilled 80-120° (or 260-300°), the rest all round the compass
function fans() {
  const collars = [], survey = [];
  let n = 0;
  for (let p = 0; p < 57; p++) {
    const x = 433000 + rnd() * 900, y = 6233000 + rnd() * 700;
    for (let k = 0; k < (p % 3 === 0 ? 2 : 1); k++) {
      const id = `SR23-${++n}`, main = rnd() < 0.55;
      const az = main ? (rnd() < 0.5 ? 80 + rnd() * 40 : 260 + rnd() * 40) : rnd() * 360;
      const dip = -(45 + rnd() * 20);
      collars.push({ hole_id: id, x, y, z: 800 + rnd() * 50, length: 180 + rnd() * 100, azimuth: az, dip });
      for (const d of [0, 60, 120, 180]) survey.push({ hole_id: id, depth: d, azimuth: (az + rnd() * 3 + 360) % 360, dip: dip + rnd() * 2 });
    }
  }
  return { collars, survey };
}

test("a hole's azimuth: its stations weighted by length and how horizontal; vertical holes have none", () => {
  assert.equal(Math.round(holeAzimuthOf({ length: 100 }, [{ depth: 0, azimuth: 95, dip: -60 }, { depth: 50, azimuth: 99, dip: -58 }])), 97, "stations weighted by the length they cover");
  assert.equal(Math.round(holeAzimuthOf({ length: 100 }, [{ depth: 0, azimuth: 275, dip: -60 }])), 95, "folded to 0-180: the opposite way is the same section");
  assert.equal(holeAzimuthOf({ length: 100 }, [{ depth: 0, azimuth: 40, dip: -89 }]), null, "a vertical hole points nowhere");
  assert.equal(Math.round(holeAzimuthOf({ length: 100, azimuth: 120, dip: -50 }, [])), 120, "no survey rows: the collar's own azimuth / dip");
  assert.equal(holeAzimuthOf({ length: 100 }, []), null);
  // a long steep tail does not outvote the shallower upper part's direction by much: weights are length x cos(dip)
  const a = holeAzimuthOf({ length: 300 }, [{ depth: 0, azimuth: 90, dip: -45 }, { depth: 100, azimuth: 110, dip: -75 }]);
  assert.ok(a > 90 && a < 100, String(a));
});

test("fans: the commonest hole azimuth comes out near 100°, not the collar bearing", () => {
  const { collars, survey } = fans();
  const h = commonestHoleAzimuth(collars, survey);
  assert.ok(h, "found");
  assert.ok(Math.abs(h.azimuth - 100) <= 15, `azimuth ${h.azimuth}`);
  assert.ok(h.share >= HOLE_AZ_MIN_SHARE && h.n <= h.of);
  const g = drillLineGeometry(collars, {});
  assert.equal(g.lines, false, "the pads are not in lines");
  assert.equal(g.source, "collars");
  const g2 = drillLineGeometry(collars, { holes: h });
  assert.equal(g2.azimuth, h.azimuth, "the azimuth follows the holes");
  assert.equal(g2.source, "holes");
  assert.equal(g2.holes.of, h.of);
});

test("the hole filter: only the checked holes decide (the 36 'Contact' holes at their own azimuth)", () => {
  const { collars, survey } = fans();
  const only = collars.slice(0, 36);
  const h = commonestHoleAzimuth(only, survey);
  assert.ok(h && h.of <= 36 && h.of >= 20, JSON.stringify(h));
  assert.ok(Math.abs(h.azimuth - 100) <= 20, `azimuth ${h.azimuth}`);
  assert.equal(commonestHoleAzimuth(collars.slice(0, 3), survey), null, "three checked holes decide nothing");
});

test("no common direction (holes all round the compass), or too few holes: the collar bearings as before", () => {
  const collars = [], survey = [];
  for (let i = 0; i < 40; i++) { const id = `R${i}`; collars.push({ hole_id: id, x: i * 37, y: (i * 91) % 400, length: 100 }); survey.push({ hole_id: id, depth: 0, azimuth: (i * 9) % 360, dip: -60 }); }
  assert.equal(commonestHoleAzimuth(collars, survey), null);
  assert.equal(commonestHoleAzimuth(collars.slice(0, 4), survey), null, "under five holes");
  const g = drillLineGeometry(collars, { holes: null });
  assert.equal(g.source, "collars");
});

test("drill lines (the holes ARE in lines) keep the collar bearing; the holes' azimuth is not used", () => {
  const collars = []; for (let l = 0; l < 4; l++) for (let i = 0; i < 12; i++) collars.push({ hole_id: `L${l}-${i}`, x: 1000 + l * 100 + i * 0.5, y: 5000 + i * 25 });
  const g = drillLineGeometry(collars, { holes: { azimuth: 90, share: 0.9, n: 10, of: 10 } });
  assert.equal(g.lines, true);
  assert.equal(g.source, "collars");
  assert.ok(g.azimuth < 10 || g.azimuth > 170, String(g.azimuth));
});

test("the buffer says PAD spacing when holes share pads, drill spacing otherwise", () => {
  const { collars } = fans();
  const s = drillSiteSpacing(collars);
  assert.equal(s.shared, true);
  assert.equal(s.collars, collars.length);
  assert.ok(s.sites < s.collars);
  assert.equal(drillSiteSpacing(collars.filter((c, i, a) => a.findIndex((d) => d.x === c.x) === i)).shared, false);
  assert.match(read("../src/modules/viewer/ViewerParts.jsx"), /spacing\.shared \? tr\("half the \{s\} m pad spacing"/);
});

test("wiring: the hook gets the survey and says which azimuth it used, in four languages", () => {
  const h = read("../src/modules/viewer/drillLines.js");
  assert.match(h, /export function useDrillLineDefaults\(collars, survey = null\)/);
  assert.match(h, /commonestHoleAzimuth\(collars, survey\)/);
  assert.match(h, /Azimuth along the commonest hole azimuth \(\{az\}°: \{n\} of \{of\} holes within 15°\)/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /useDrillLineDefaults\(shownCollars, survey\)/);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); assert.ok(j["half the {s} m pad spacing"], l); assert.ok(j["No drill lines found: the holes are not in lines. Azimuth along the commonest hole azimuth ({az}°: {n} of {of} holes within 15°)."], l); }
});
