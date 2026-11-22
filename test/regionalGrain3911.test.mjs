// TASKS.csv #3911 (redesign P8b) — the regional direction hint (lib/regionalGrain.js): the grain of the mapped contacts around the project, a
// direction only, weak or fair, never suggested; seams along tile squares are not contacts; no grain, one unit or no map is said. SYNTHETIC polygons.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { regionalGrain, regionalCandidate, regionalNoneText, regionalArea } from "../src/lib/regionalGrain.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const LON0 = -120, LAT0 = 50, MX = 111320 * Math.cos((LAT0 * Math.PI) / 180), MY = 110574;
const ll = ([x, y]) => [LON0 + x / MX, LAT0 + y / MY];
const ring = (pts) => { const r = pts.map(ll); r.push(r[0]); return r; };
// n stripes, `lenM` long and 1 km wide, running along `strikeDeg`: the contacts between them run that way
function stripes(n, strikeDeg, lenM = 10000) {
  const s = (strikeDeg * Math.PI) / 180, a = [Math.sin(s), Math.cos(s)], p = [Math.cos(s), -Math.sin(s)];
  return Array.from({ length: n }, (_, i) => {
    const o = [p[0] * 1000 * i, p[1] * 1000 * i], q = [o[0] + p[0] * 1000, o[1] + p[1] * 1000];
    return { parts: [ring([o, [o[0] + a[0] * lenM, o[1] + a[1] * lenM], [q[0] + a[0] * lenM, q[1] + a[1] * lenM], q])], attributes: { unit: i % 2 ? "Unit A" : "Unit B" } };
  });
}
// hexagons (turned 15°: no edge along a line of latitude, which would read as a seam): contacts every way, no grain (round bodies, or contacts
// that wind with the hills)
const hexes = () => Array.from({ length: 6 }, (_, i) => {
  const c = [(i % 3) * 3000, Math.floor(i / 3) * 3000];
  return { parts: [ring(Array.from({ length: 6 }, (_, k) => [c[0] + 1000 * Math.cos((k * Math.PI) / 3 + 0.26), c[1] + 1000 * Math.sin((k * Math.PI) / 3 + 0.26)]))], attributes: { unit: `Unit ${i}` } };
});

test("#3911 striped units: the contacts give the strike (as an axis), fair, with the length of contact it rests on", () => {
  for (const strike of [45, 120, 170]) {
    const g = regionalGrain(stripes(6, strike));
    assert.ok(Math.abs(g.strikeDeg - strike) < 1, JSON.stringify(g));
    assert.equal(g.strength, "fair");
    assert.equal(g.units, 2);
    assert.equal(g.polygons, 6);
    assert.ok(g.contactKm > 100);
  }
});

test("#3911 seams along a tile square or the area box (constant longitude or latitude) are not contacts", () => {
  const f = stripes(4, 45);
  // a long straight edge of constant longitude, as a polygon cut at a tile square: it would pull the strike to north-south
  f.push({ parts: [[[LON0 - 0.5, LAT0 - 0.5], [LON0 - 0.5, LAT0 + 0.5], [LON0 - 0.4, LAT0 + 0.5], [LON0 - 0.4, LAT0 - 0.5], [LON0 - 0.5, LAT0 - 0.5]]], attributes: { unit: "Unit C" } });
  const g = regionalGrain(f);
  assert.ok(Math.abs(g.strikeDeg - 45) < 1, JSON.stringify(g));
});

test("#3911 no grain, one unit, no map: no card, said plainly; offline said too", () => {
  const h = regionalGrain(hexes());
  assert.equal(h.none, "nograin", JSON.stringify(h));
  assert.equal(regionalCandidate(h), null);
  assert.match(regionalNoneText(h), /no clear direction here\. In flat-lying country the contacts follow the hills/);
  const one = regionalGrain(stripes(3, 45).map((f) => ({ ...f, attributes: { unit: "Unit A" } })));
  assert.equal(one.none, "nocontacts");
  assert.match(regionalNoneText(one), /one unit only/);
  assert.equal(regionalGrain([]).none, "nopolygons");
  assert.equal(regionalNoneText(regionalGrain(null)), "Macrostrat has no mapped geology around the project.");
  assert.equal(regionalNoneText(null, { offline: true }), "No internet connection: the regional geology can't be looked at now.");
});

test("#3911 a weaker grain is weak; never strong", () => {
  const f = [...stripes(3, 45, 4000), ...hexes()];
  const g = regionalGrain(f);
  assert.ok(g.strength === "weak" || g.strength === "fair", JSON.stringify(g));
  assert.notEqual(g.strength, "strong");
});

test("#3911 the card: direction only, 'not a dip', never suggested, in words", () => {
  const c = regionalCandidate(regionalGrain(stripes(6, 45)));
  assert.equal(c.directionOnly, true);
  assert.equal(c.suggested, false);
  assert.equal(c.source, "regional");
  assert.equal(c.words, "Runs north-east to south-west; its tilt is unknown.");
  assert.match(c.numbers, /^strike 04[45]°$/);
  assert.deepEqual(c.warnings, ["Regional direction only, not a dip: from a small-scale map, and your deposit may differ."]);
  assert.match(c.reason, /^The direction the contacts between 2 mapped units run in the published geology map around the project \(\d[\d,.]* km of contacts, Macrostrat\)\.$/);
});

test("#3911 the area looked at: the project's box, at least 20 km across, centred on it", () => {
  const a = regionalArea([-120.01, 49.99, -119.99, 50.01]);
  const wKm = ((a[2] - a[0]) * 111320 * Math.cos((50 * Math.PI) / 180)) / 1000, hKm = ((a[3] - a[1]) * 110574) / 1000;
  assert.ok(Math.abs(wKm - 20) < 0.01 && Math.abs(hKm - 20) < 0.01, `${wKm} × ${hKm}`);
  const big = regionalArea([-121, 49, -119, 51]);
  assert.deepEqual(big, [-121, 49, -119, 51]);
  assert.equal(regionalArea(null), null);
});

test("#3911 fetched only on a click, through the existing Macrostrat tiles (no new host or endpoint)", () => {
  const f = read("../src/lib/macrostratFetch.js");
  assert.match(f, /export async function fetchMacrostratUnitPolygons\(\{ bboxLonLat, onProgress(, signal)? \}\) \{\n  const \{ plan, count, tiles, failed, scaleNote \} = await fetchMacrostratTiles\(bboxLonLat, onProgress(, signal)?\);/); // signal: #3963, scaleNote: #3974
  const h = read("../src/modules/viewer/TrendHelper.jsx");
  assert.match(h, /onClick=\{lookRegional\}/);
  assert.equal((h.match(/fetchMacrostratUnitPolygons\(/g) || []).length, 1);
  assert.doesNotMatch(h, /https?:\/\//, "no address of its own");
  assert.match(read("../PRIVACY.md"), /`tiles\.macrostrat\.org`, `macrostrat\.org`/);
});
