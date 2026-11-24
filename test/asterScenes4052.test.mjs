// TASKS.csv #4052 — which ASTER scene is offered first: coverage of the area, then a clear-season daytime pass. Made-up scenes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearMonths, solarHour, isDaytime, describeScene, rankAsterScenes, monthName, crossTrackAngle, searchAdvice } from "../src/lib/asterScenes.js";

test("the clear months follow the project's hemisphere and the tropics' dry season", () => {
  assert.deepEqual(clearMonths(63.2), [7, 8, 9]);
  assert.deepEqual(clearMonths(null), [7, 8, 9], "unknown latitude counts as north");
  assert.deepEqual(clearMonths(-30), [12, 1, 2]);
  assert.deepEqual(clearMonths(-21.5), [6, 7, 8, 9], "the Pilbara's dry season");
  assert.deepEqual(clearMonths(10), [12, 1, 2, 3]);
});

test("a pass is a daytime one by its local solar hour: ASTER crosses at about 10:30 by day and 22:30 by night", () => {
  const lon = -130.4; // Macpass
  assert.ok(Math.abs(solarHour("2003-07-24T19:12:00Z", lon) - 10.5) < 0.1);
  assert.equal(isDaytime("2003-07-24T19:12:00Z", lon), true);
  assert.equal(isDaytime("2003-07-25T07:10:00Z", lon), false, "the night pass");
  assert.equal(isDaytime("not a date", lon), false);
  assert.ok(solarHour("2003-07-24T23:30:00Z", 150) < 24 && solarHour("2003-07-24T23:30:00Z", 150) >= 0, "wraps past midnight");
});

test("a scene is described by its month, daytime and season", () => {
  const s = describeScene({ date: "2003-07-24", datetime: "2003-07-24T19:12:00Z", coverage: 1, cloud: 2 }, 63.2, -130.4);
  assert.equal(s.month, 7); assert.equal(s.day, true); assert.equal(s.inSeason, true);
  const w = describeScene({ date: "2004-01-09", datetime: "2004-01-09T07:20:00Z", coverage: 1, cloud: 0 }, 63.2, -130.4);
  assert.equal(w.inSeason, false); assert.equal(w.day, false);
  assert.equal(describeScene({ date: "2004-01-09", coverage: 1 }, 63.2, -130.4).day, null, "no time: day / night unknown");
  assert.equal(monthName(7), "July");
});

test("ranking: coverage first, then a clear-season daytime scene, then clouds", () => {
  const mk = (id, date, datetime, coverage, cloud) => describeScene({ id, date, datetime, coverage, cloud }, 63.2, -130.4);
  const list = [
    mk("winterNight", "2004-01-09", "2004-01-09T07:20:00Z", 1.00, 0),     // covers all, but a January night
    mk("summerDay", "2003-07-24", "2003-07-24T19:12:00Z", 0.99, 8),       // covers all (same 5 % step), July by day
    mk("summerDayHalf", "2005-08-02", "2005-08-02T19:12:00Z", 0.55, 0),   // clear but only half of the area
    mk("summerNight", "2002-07-30", "2002-07-30T07:05:00Z", 1.00, 1),     // July night
    mk("springDay", "2001-05-20", "2001-05-20T19:10:00Z", 1.00, 3),       // May day: out of the clear months
  ];
  assert.deepEqual(rankAsterScenes(list).map((s) => s.id), ["summerDay", "summerNight", "springDay", "winterNight", "summerDayHalf"]);
  assert.equal(rankAsterScenes(list)[0].id, "summerDay", "the winter night that covers 1 % more does not win");
  assert.equal(rankAsterScenes([]).length, 0);
});

test("the catalogue's own sun elevation decides day when it is given; the cloud limit comes after the season", () => {
  assert.equal(describeScene({ date: "2003-07-24", datetime: "2003-07-24T07:00:00Z", sunElevation: 40, coverage: 1 }, 63.2, -130.4).day, true, "the elevation wins over the solar hour");
  assert.equal(describeScene({ date: "2003-07-24", datetime: "2003-07-24T19:00:00Z", sunElevation: -5, coverage: 1 }, 63.2, -130.4).day, false);
  const mk = (id, cloud, m) => describeScene({ id, date: `2004-${m}-10`, datetime: `2004-${m}-10T19:00:00Z`, coverage: 1, cloud }, 63.2, -130.4);
  const list = [mk("julyCloudy", 60, "07"), mk("julyClear", 10, "07"), mk("mayClear", 2, "05")];
  assert.deepEqual(rankAsterScenes(list, { maxCloud: 20 }).map((s) => s.id), ["julyClear", "julyCloudy", "mayClear"], "season first, then under the cloud limit, then fewer clouds");
});

test("the stripe angle from the footprint: a tilted square's cross-track edges, whatever the jagged outline between its corners", () => {
  // corners of a 60 km square turned so its top edge falls 19.4 degrees to the right (picture coordinates, y down): top, right, bottom, left
  const a = (19.4 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), L = 60000;
  const top = [0, 0], right = [L * c, -L * s], bottom = [L * c - L * s, -L * s - L * c], left = [-L * s, -L * c];
  const jag = (p, q) => Array.from({ length: 30 }, (_, i) => [p[0] + ((q[0] - p[0]) * i) / 30 + (i % 2 ? 90 : -90), p[1] + ((q[1] - p[1]) * i) / 30 + (i % 3 ? 70 : -70)]);
  const ring = [...jag(top, right), ...jag(right, bottom), ...jag(bottom, left), ...jag(left, top)];
  assert.ok(Math.abs(crossTrackAngle(ring) - -19.4) <= 0.3, `angle ${crossTrackAngle(ring)}`);
  assert.equal(crossTrackAngle([[0, 0], [1, 0]]), null, "not a polygon");
  // a square turned the other way (the top edge rising to the right): a positive angle
  const b = (8 * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b);
  assert.ok(Math.abs(crossTrackAngle([[0, 0], [100 * cb, 100 * sb], [100 * cb + 100 * sb, 100 * sb - 100 * cb], [100 * sb, -100 * cb]]) - 8) <= 0.1);
});

test("what the first scene does not give is said: partial cover, a month outside the clear months, a night pass", () => {
  const mk = (cov, date, datetime) => describeScene({ id: "x", date, datetime, coverage: cov, cloud: 5 }, 63.2, -130.4);
  assert.deepEqual(searchAdvice([mk(0.54, "2001-05-20", "2001-05-20T20:26:00Z")]), { coverage: 54, offSeasonMonth: 5, night: false });
  assert.deepEqual(searchAdvice([mk(1, "2003-07-24", "2003-07-24T19:12:00Z")]), { coverage: null, offSeasonMonth: null, night: false });
  assert.equal(searchAdvice([mk(1, "2003-07-25", "2003-07-25T07:10:00Z")]).night, true);
  assert.equal(searchAdvice([]), null);
});

test("wiring: the ASTER search ranks, the read treats the thermal bands, the modal says the month and warns", () => {
  const f = readFileSync(new URL("../src/lib/imageryFetch.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(f, /rankAsterScenes\(\(d\.features \|\| \[\]\)/);
  assert.doesNotMatch(f, /collections: \["aster-l1t"\], bbox, query:/, "no cloud cut in the archive search");
  assert.match(f, /treatTirBands\(bands, g\.width, g\.height, \{ smooth: tir\?\.smooth !== false, around \}\)/);
  assert.match(f, /colder than 0 °C at 10\.7 µm left out as probably snow, ice, cloud or cold water/);
  assert.match(f, /The thermal bands have no snow mask: thin or warm snow is not caught/);
  assert.match(f, /thermal bands 10-14 as at-sensor radiance, with no atmospheric or temperature correction \(compare values within this scene only\)/, "the radiance wording stays");
  const m = readFileSync(new URL("../src/components/SpectralIndexModal.jsx", import.meta.url), "utf8");
  assert.match(m, /indexTrust\(r\.values, tirStats\.width, tirStats\.height, tirStats\.angleDeg\)/);
  assert.match(m, /Can't trust this index/);
  assert.match(m, /AST_05 emissivity files \(an Earthdata login\)/);
  assert.match(m, /searchAdvice\(list\)/);
});
