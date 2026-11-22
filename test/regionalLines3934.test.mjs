// TASKS.csv #3934 — the trend helper's regional hint also reads Macrostrat's mapped faults and fold axes (the tiles' LINES layer), each kind on
// its own card, a direction only (no dips, plunges or fold shape), with its maps' credit, never suggested; the other line kinds are left out; a
// line in two overlapping tiles is counted once. SYNTHETIC tiles and lines.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lineKindOf, macrostratLineFeatures, macrostratSourceNames, tileToLonLat, lonLatToTilePx, clipSegment } from "../src/lib/macrostrat.js";
import { regionalLines, regionalLineCandidates } from "../src/lib/regionalGrain.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const LON0 = -120, LAT0 = 50, MX = 111320 * Math.cos((LAT0 * Math.PI) / 180), MY = 110574;
const ll = ([x, y]) => [LON0 + x / MX, LAT0 + y / MY];
const line = (kind, strikeDeg, off, lenM = 8000, src = 1) => {
  const s = (strikeDeg * Math.PI) / 180, p = [Math.cos(s) * off, -Math.sin(s) * off];
  return { kind, type: kind, name: "", sourceId: src, parts: [[ll(p), ll([p[0] + Math.sin(s) * lenM, p[1] + Math.cos(s) * lenM])]] };
};

test("#3934 the kinds read from a line's type: faults and fold axes, not moraines or dikes", () => {
  for (const t of ["fault", "Thrust fault", "normal fault", "shear zone"]) assert.equal(lineKindOf(t), "fault", t);
  for (const t of ["anticline", "Syncline", "fold", "overturned anticline", "monocline"]) assert.equal(lineKindOf(t), "fold", t);
  for (const t of ["moraine", "dike", "lineament", "", null]) assert.equal(lineKindOf(t), null, String(t));
});

test("#3934 each kind's direction, length-weighted as an axis, with its length, maps and strength; no grain: no card", () => {
  const ls = [line("fault", 40, 0), line("fault", 40 + 180, 1000), line("fault", 42, 2000, 8000, 2), line("fold", 120, 0), line("fold", 118, 3000), line("dike", 0, 0)];
  const r = regionalLines(ls);
  assert.ok(Math.abs(r.fault.strikeDeg - 40.7) < 1, JSON.stringify(r.fault)); // 40, its reverse (220 = the same axis), 42
  assert.equal(r.fault.strength, "fair"); assert.ok(r.fault.km > 20 && r.fault.km < 30); assert.deepEqual(r.fault.sources, [1, 2]);
  assert.ok(Math.abs(r.fold.strikeDeg - 119) < 1.5, JSON.stringify(r.fold));
  const cards = regionalLineCandidates(r, new Map([[1, "Test map A"], [2, "Test map B"]]));
  assert.deepEqual(cards.map((c) => c.id), ["regional_faults", "regional_folds"]);
  for (const c of cards) {
    assert.equal(c.directionOnly, true); assert.equal(c.suggested, false); assert.equal(c.dip, 90);
    assert.match(c.warnings[0], /^Direction only: no dips, plunges or fold shape\.$/);
    assert.match(c.reason, /Macrostrat, CC BY 4\.0/);
  }
  assert.match(cards[0].reason, /^Mapped faults around the project \(\d+(\.\d)? km, Macrostrat, CC BY 4\.0\)\. Maps: Test map A; Test map B\.$/);
  assert.ok(Math.abs(cards[0].dipAzimuth - (r.fault.strikeDeg + 90)) < 1e-9);
  // faults every way: no grain, no card
  const scatter = regionalLines([0, 45, 90, 135].map((s, i) => line("fault", s, i * 1000)));
  assert.equal(scatter.fault.strength, null);
  assert.deepEqual(regionalLineCandidates(scatter), []);
  assert.deepEqual(regionalLines([]), {});
});

test("#3934 from the tiles: kept to the area and to each tile's own square (overlapping tiles count a line once), in longitude / latitude", () => {
  const z = 12, area = [LON0 - 0.05, LAT0 - 0.05, LON0 + 0.05, LAT0 + 0.05];
  const [tx, ty] = lonLatToTilePx(z, 0, 0, 1, LON0, LAT0).map(Math.floor); // the tile holding the centre
  const tile = (x, y, path) => ({ z, x, y, layers: [{ name: "lines", extent: 4096, features: [{ type: "line", properties: { type: "fault", source_id: 7, ref_title: "Test map" }, geometry: [path] }] }] });
  const [cx, cy] = lonLatToTilePx(z, tx, ty, 4096, LON0, LAT0).map(Math.round);
  const inside = [[cx - 100, cy - 100], [cx + 100, cy + 100]];
  // the same line again in the tile to the east, in its buffer (x below 0): outside that tile's own square, not counted twice
  const buffered = inside.map(([x, y]) => [x - 4096, y]);
  const f = macrostratLineFeatures([tile(tx, ty, inside), tile(tx + 1, ty, buffered)], area);
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.equal(f[0].kind, "fault"); assert.equal(f[0].sourceId, 7);
  const [lon, lat] = f[0].parts[0][0];
  assert.deepEqual([lon, lat], tileToLonLat(z, tx, ty, 4096, cx - 100, cy - 100));
  assert.deepEqual([...macrostratSourceNames([tile(tx, ty, inside)])], [[7, "Test map"]]);
  // a long straight segment across the tile with no vertex in it (found live: a simplified line, both ends outside) is still read, cut at the edges
  const across = macrostratLineFeatures([tile(tx, ty, [[-2000, cy], [6000, cy]])], [-180, -85, 180, 85]);
  assert.equal(across.length, 1, "a segment crossing the tile");
  const [w, e] = [across[0].parts[0][0], across[0].parts[0].at(-1)];
  assert.deepEqual(w, tileToLonLat(z, tx, ty, 4096, 0, cy)); assert.deepEqual(e, tileToLonLat(z, tx, ty, 4096, 4096, cy));
  assert.deepEqual(clipSegment([0, 0], [10, 0], [2, -1, 5, 1]), [[2, 0], [5, 0]]);
  assert.equal(clipSegment([0, 5], [10, 5], [2, -1, 5, 1]), null);
  // a line with no vertex in the area: nothing
  assert.equal(macrostratLineFeatures([tile(tx, ty, inside)], [LON0 + 1, LAT0 + 1, LON0 + 1.1, LAT0 + 1.1]).length, 0);
});

test("#3934 wired: the same request (no other host), the cards in the trend helper beside the contacts' card", () => {
  const f = read("../src/lib/macrostratFetch.js"), h = read("../src/modules/viewer/TrendHelper.jsx");
  assert.match(f, /return \{ features: macrostratUnitFeatures\(tiles, bboxLonLat\)\.features, lines: macrostratLineFeatures\(tiles, bboxLonLat\), sourceNames: macrostratSourceNames\(tiles\),/);
  assert.match(h, /const cards = \[\.\.\.\(card \? \[card\] : \[\]\), \.\.\.regionalLineCandidates\(regionalLines\(got\.lines\), got\.sourceNames\)\];/);
  assert.match(h, /const cands = \[\.\.\.\(result\?\.candidates \|\| \[\]\), \.\.\.\(regional\?\.cards \|\| \[\]\)\];/);
  assert.match(h, /reads the direction its contacts, faults and fold axes run: a regional direction only, not a dip\./);
});
