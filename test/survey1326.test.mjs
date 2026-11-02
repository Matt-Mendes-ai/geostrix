import test from "node:test";
import assert from "node:assert/strict";
import { parseXYZ, guessXyzChannels } from "../src/lib/geosoft.js";
import { parseDcipWhitespaceText, guessDcipColumns, parseDcipRows, apparentResistivity } from "../src/lib/dcip.js";
import { parseStationFile } from "../src/lib/dcipStations.js";
import { gridPairs, fitGridToWorld, stationPlacer, nearestStationZ, looksLikeLocalGrid } from "../src/lib/gridFromStations.js";

const dollar = ["$$DATA$$      7   -1    4  -2000       1", "Company", "Project", "Boundary Grid", "Total Field Magnetometer Survey", "LINESTN GRIDXGD YGD RAW MAG", "   3   3   3   2   2   1   1", "(T41,2A8,A3,T1,2F10.0,2F9.0)",
  "    4650.0    9000.0  57406.1  57758.5     9000N   4650E  1", "    4662.5    9000.0  57680.2  58032.6     9000N   4662E  1"].join("\r\n");
test("#1326 a $$DATA$$ table: columns by its own format, wherever they sit", () => {
  const { columns, rows } = parseXYZ(dollar);
  assert.deepEqual(columns, ["LINE", "STN", "GRID", "XGD", "YGD", "RAW", "MAG"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].XGD, 4650); assert.equal(rows[0].YGD, 9000); assert.equal(rows[0].MAG, 57758.5); assert.equal(rows[0].RAW, 57406.1);
  assert.equal(rows[0].LINE, "9000N"); assert.equal(rows[1].STN, "4662E"); assert.equal(rows[0]._line, "9000N");
  assert.equal(guessXyzChannels(columns, rows).value, "MAG");
});
const fld = ["/-----  S C I N T R E X", "/!  Line____: 6300.00 N", "/!  Mag_Data: X/Y/TotFld/Noise/Hours/0=Uncor", "/------", "        6300          6300  58513.2   0.07  16.488056  0", "      6287.5          6300  58563.5   0.08  16.492500  0"].join("\n");
test("#1326 a Scintrex field file; a base-station file says what it is", () => {
  const { columns, rows } = parseXYZ(fld);
  assert.deepEqual(columns, ["X", "Y", "TotFld", "Noise", "Hours", "Uncor"]);
  assert.equal(rows[1].X, 6287.5); assert.equal(rows[0].TotFld, 58513.2); assert.equal(rows[0]._line, "6300N");
  assert.throws(() => parseXYZ("/!  Mag_Data: Hours/TotFld/Time\n 6.8  57389.9  06:50:07\n"), /base-station/);
});
test("#1326 a Geosoft .xyz still reads as it did", () => {
  const { columns, rows } = parseXYZ("/ X Y MAG\nLine 10\n100 200 50000\n");
  assert.deepEqual(columns, ["X", "Y", "MAG"]);
  assert.equal(rows[0]._line, "10");
});
const ipg = ["GEOSOFT IP SYSTEM - POLE-DIPOLE DATA   06-08-10", "LINE:10050N ARRAY:PLDP DIPOLE:50 UNITS:M", "      T1X      T2X      R1X      R2X       Vp        I       SP       Mx       SD", "   6900.0        *   6800.0   6850.0   4318.8      0.5       14      4.8      0.0", "   6900.0        *   6750.0   6800.0  1303.65      0.5        2      5.3      0.0"].join("\n");
test("#1326 an IP file with Vp and I and no resistivity: computed, matching the contractor's", () => {
  const t = parseDcipWhitespaceText(ipg);
  const m = guessDcipColumns(t.headers);
  assert.equal(m.rho, "RHO");
  const p = parseDcipRows(t.rows, m);
  assert.equal(p.readings.length, 2);
  assert.ok(Math.abs(p.rho[0] - 5424) < 5, String(p.rho[0]));
  assert.ok(Math.abs(p.rho[1] - 4915) < 5, String(p.rho[1]));
  assert.equal(p.ip[0], 4.8);
  assert.match(t.note, /computed from Vp/);
  assert.equal(p.array, "pole-dipole");
});
test("#1326 geometric factor: dipole-dipole, and nothing from a bad reading", () => {
  assert.ok(Math.abs(apparentResistivity(0, 10, 20, 30, 1000, 1) - (Math.PI * 10 * 1 * 2 * 3)) < 1e-6);
  assert.equal(apparentResistivity(0, null, 0, 10, 100, 1), null);
  assert.equal(apparentResistivity(0, null, 10, 20, 100, 0), null);
  assert.equal(parseDcipWhitespaceText("T1X T2X R1X R2X RHO Mx\n1 * 2 3 100 4\n").headers.includes("RHO"), true);
});
const gps = (datum, rows) => ["H  R DATUM", `M E ${datum} 066  0.0 0.0 0 0 0`, "U  UTM UPS", ...rows.map(([n, e, y, z]) => `W ${n}       10U ${e} ${y} City (Small)        I E    ${z} 31/12/1989 00:00:00 x`)].join("\n");
test("#1326 a GPS file's datum: NAD83 as well as WGS 84", () => {
  const rows = [["9000N 4650E", 343181, 6204481, 1710.8], ["9000N 4700E", 343224, 6204514, 1672.1]];
  assert.equal(parseStationFile(gps("NAD83", rows), "x").epsg, 26910);
  assert.equal(parseStationFile(gps("WGS 84 100", rows), "x").epsg, 32610);
});
test("#1326 a local grid placed from its stations: rotation, offset, and a bad shot left out", () => {
  const az = 38 * Math.PI / 180, world = (gx, gy) => [343000 + gx * Math.cos(az) + gy * Math.sin(az), 6200000 - gx * Math.sin(az) + gy * Math.cos(az)];
  const lines = {};
  for (const line of [9000, 9200, 9400]) { lines[`${line}N`] = []; for (let s = 4600; s <= 5200; s += 50) { const [x, y] = world(s, line); lines[`${line}N`].push({ s, x, y, z: 1500 }); } }
  lines["9200N"][3].x += 400;
  const pairs = gridPairs(lines);
  assert.equal(pairs[0].gx, 4600); assert.equal(pairs[0].gy, 9000);
  const fit = fitGridToWorld(pairs);
  assert.equal(fit.dropped, 1);
  assert.ok(fit.rms < 0.01, String(fit.rms));
  const [x, y] = fit.apply(4800, 9100), [wx, wy] = world(4800, 9100);
  assert.ok(Math.hypot(x - wx, y - wy) < 0.01);
  assert.ok(Math.abs(fit.scale - 1) < 1e-6);
  assert.equal(nearestStationZ(pairs, 4801, 9001), 1500);
  assert.equal(nearestStationZ(pairs, 90000, 1), null);
  assert.deepEqual(gridPairs({ "8575E": [{ s: 750, x: 1, y: 2 }], "Infinite": [{ s: 1, x: 1, y: 1 }] }).map((p) => [p.gx, p.gy]), [[8575, 750]]);
  assert.equal(fitGridToWorld([{ gx: 0, gy: 0, x: 0, y: 0 }]), null);
  assert.equal(fitGridToWorld([0, 1, 2, 3].map((i) => ({ gx: i, gy: 0, x: i, y: 0 }))), null, "one line says nothing across it");
});
test("#1326 a reading follows its own line's stations, even where the grid is not regular", () => {
  // a line that bends away from the rest: the grid-wide fit is far off it, the stations are not
  const lines = { "100N": [], "200N": [], "300N": [] };
  for (const line of [100, 200, 300]) for (let s = 0; s <= 400; s += 50) { const bend = line === 300 ? (s / 400) * 300 : 0; lines[`${line}N`].push({ s, x: 1000 + s, y: 5000 + line + bend, z: 10 }); }
  const pairs = gridPairs(lines), pl = stationPlacer(pairs);
  assert.equal(pl.lines, 3);
  const onBend = pl.place(225, 300);
  assert.equal(onBend.onLine, true);
  assert.ok(Math.abs(onBend.x - 1225) < 1e-9);
  assert.ok(Math.abs(onBend.y - (5300 + (225 / 400) * 300)) < 1e-9, String(onBend.y));
  const [fx, fy] = pl.fit.apply(225, 300);
  assert.ok(Math.hypot(fx - onBend.x, fy - onBend.y) > 20, "the fit alone would be far off");
  const off = pl.place(225, 150);
  assert.equal(off.onLine, false, "between lines: the fit");
  const past = pl.place(450, 200);
  assert.equal(past.onLine, true, "just past the last station, carried on");
  assert.ok(Math.abs(past.x - 1450) < 1e-9);
  assert.equal(pl.place(5000, 200).onLine, false, "far past it: not carried on");
  const ns = stationPlacer(gridPairs({ "500E": [{ s: 0, x: 1, y: 10 }, { s: 100, x: 1, y: 110 }] }));
  assert.equal(ns.place(500, 50).y, 60, "a line running north");
});
test("#1326 local grid numbers against map coordinates", () => {
  assert.equal(looksLikeLocalGrid([{ x: 4650, y: 9000 }], "x", "y"), true);
  assert.equal(looksLikeLocalGrid([{ x: 343181, y: 6204481 }], "x", "y"), false);
  assert.equal(looksLikeLocalGrid([{ x: -122.5, y: 55.1 }], "x", "y"), false);
});
test("#1327 the card closes, and does not claim nothing is loaded when a survey is", async () => {
  const { readFileSync } = await import("node:fs");
  const v = readFileSync("src/modules/ViewerModule.jsx", "utf8");
  assert.match(v, /!emptyCardClosed && !collars\.length[^\n]*!voxelModels\.length && !Object\.values\(layers\)\.some/);
  assert.match(v, /onClose=\{\(\) => setEmptyCardClosed\(true\)\}/);
});
