// TASKS.csv #834 — check every EPSG candidate (scripts/epsg/gen-epsg-registry.py) with the proj4js GeoStrix ships, against
// PROJ's own coordinates, and write the registry the app loads (src/lib/epsgRegistry.json). A code is kept only when
//   * proj4js parses its definition, and
//   * its projection reproduces PROJ's on the CRS's own datum at three points of its area of use within 5 cm, and
//   * with its datum shift, WGS 84 lon / lat -> the CRS reproduces PROJ (same operation) within 10 cm (1e-6 degrees for
//     geographic CRSs). Codes without a published shift are kept on the projection check alone (flagged).
// usage: node scripts/epsg/verify-epsg-registry.mjs <candidates.json> <out registry.json>
import fs from "node:fs";
import proj4 from "proj4";

const [inPath, outPath] = process.argv.slice(2);
const cand = JSON.parse(fs.readFileSync(inPath, "utf8"));
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";
const out = {}, dropped = { parse: [], projection: [], datum: [] };
let worstConv = 0, worstDatum = 0;
for (const [code, r] of Object.entries(cand.rows)) {
  let conv;
  try { conv = proj4(r.def); conv.forward([0, 0]); } catch { dropped.parse.push(code); continue; }
  const geog = r.kind === "geographic", tol = geog ? 1e-6 : 0.05;
  // the projection on its own datum: source = longlat on the same ellipsoid and prime meridian, no shift on either side
  let bad = false;
  if (r.convTests.length) {
    const src = `+proj=longlat ${r.ellps}${r.pm ? ` +pm=${r.pm}` : ""} +no_defs`, dst = r.def.replace(/\+towgs84=\S+/, "").replace("+datum=WGS84", r.ellps);
    for (const [lon, lat, x, y] of r.convTests) {
      let p;
      try { p = proj4(src, dst, [lon, lat]); } catch { p = [NaN, NaN]; }
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (!(d <= tol)) { bad = true; break; }
      worstConv = Math.max(worstConv, d);
    }
  }
  if (bad) { dropped.projection.push(code); continue; }
  for (const [lon, lat, x, y] of r.tests) {
    let p;
    try { p = proj4(WGS84, r.def, [lon, lat]); } catch { p = [NaN, NaN]; }
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (!(d <= (geog ? 1e-6 : 0.1))) { bad = true; break; }
    if (!geog) worstDatum = Math.max(worstDatum, d);
  }
  if (bad) { dropped.datum.push(code); continue; }
  // [name, proj4 definition, shift accuracy (m; 0 = none needed, -1 = not stated, null = no published shift), flags, area]
  // flags: 1 = a more accurate grid-based shift exists (not shipped), 2 = the shift is published for part of the area only
  // area (#835): EPSG's area of use [west, south, east, north] in degrees, rounded outward to 0.1 (east < west crosses 180)
  const [w, s, e, n] = r.area, out1 = (v, up) => Math.round((up ? Math.ceil(v * 10) : Math.floor(v * 10))) / 10;
  out[code] = [r.name, r.def.replace(/\s+\+no_defs$/, " +no_defs"), r.acc, (r.grid ? 1 : 0) | (r.part ? 2 : 0), [out1(w, false), out1(s, false), out1(e, true), out1(n, true)]];
}
const reg = { epsg: cand.epsg, proj: cand.proj, generated: new Date().toISOString().slice(0, 10), count: Object.keys(out).length, codes: out };
fs.writeFileSync(outPath, JSON.stringify(reg));
console.log(`kept ${reg.count} of ${Object.keys(cand.rows).length}; dropped parse ${dropped.parse.length}, projection ${dropped.projection.length}, datum ${dropped.datum.length}`);
console.log(`worst kept: projection ${worstConv.toExponential(2)} m, with datum ${worstDatum.toExponential(2)} m; ${fs.statSync(outPath).size.toLocaleString()} bytes`);
for (const k of ["parse", "projection", "datum"]) console.log(k, dropped[k].slice(0, 30).map((c) => `${c} ${cand.rows[c].name}`).join("; "));
