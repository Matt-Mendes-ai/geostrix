// TASKS.csv #602 — DC/IP line stations: place the line and take the ground profile from the contractor's station /
// GPS file instead of only a terrain grid or one flat elevation.
//
// Found in #600: the 3 Firs 8575E pole-dipole line (ARIS 42648Z, real Woodjam IP) inverted against FLAT ground
// (980 m) because the panel took only a loaded terrain or one number, while the survey ships the station positions
// and elevations (3Firs_GPS.txt; n1_3Firs_UTM.dat with GRID_X / GRID_Y per station). The ground along that line
// falls ~25 m over 1.4 km; a flat air/ground boundary puts that into the near-surface resistivities.
//
// Two shapes are read:
//   1. GPS Utility waypoint files ("W 8575E 750N  10U 608587 5786735 Waypoint I E 1002.9"): name = "<line>
//      <station><N|S|E|W>", UTM zone, easting, northing, altitude. A waypoint that is not "<line> <station>" (the
//      pole "Infinite") is set aside and named in the notice. "M E WGS 84" gives the datum, so the zone becomes
//      EPSG:326zz / 327zz for reprojection into the project CRS.
//   2. Tables (CSV / tab / whitespace) with a station column (STN / station) and X / Y (GRID_X, easting...),
//      optionally Z (elev, alt, RL) and LINE.
// Station numbers are distances along the line in the line file's own chainage (S / W suffix = negative).

const ZONE = /^(\d{1,2})([C-HJ-NP-X])$/i;
const isNum = (t) => t != null && t !== "" && Number.isFinite(Number(t));

function stationNumber(tok) {
  const m = /^(-?\d+(?:\.\d+)?)([NSEW])?$/i.exec(String(tok).trim());
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] && /[SW]/i.test(m[2]) ? -v : v;
}

function parseGpsUtility(lines) {
  const stations = [], other = [];
  let wgs84 = false, zone = null, south = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^M\s/.test(l) && /WGS\s*-?\s*84/i.test(l)) wgs84 = true;
    if (!/^W\s/.test(l)) continue;
    const t = l.split(/\s+/);
    const k = t.findIndex((x, i) => i >= 2 && ZONE.test(x) && isNum(t[i + 1]) && isNum(t[i + 2]));
    if (k < 0) continue;
    const name = t.slice(1, k).join(" ");
    const zm = ZONE.exec(t[k]);
    zone = zone ?? Number(zm[1]); south = zm[2].toUpperCase() < "N";
    const x = Number(t[k + 1]), y = Number(t[k + 2]);
    const zTok = t.slice(k + 3).find(isNum);
    const z = zTok != null ? Number(zTok) : null;
    const parts = name.split(/\s+/);
    const s = parts.length >= 2 ? stationNumber(parts[parts.length - 1]) : null;
    if (s == null) { other.push({ name, x, y, z }); continue; }
    stations.push({ line: parts.slice(0, -1).join(" "), s, x, y, z });
  }
  return { stations, other, epsg: wgs84 && zone ? (south ? 32700 : 32600) + zone : null, crsNote: zone ? `UTM zone ${zone}${wgs84 ? ", WGS 84" : ""}` : "" };
}

function parseTable(lines) {
  const split = (l) => (l.includes(",") ? l.split(",") : l.includes("\t") ? l.split("\t") : l.trim().split(/\s+/)).map((x) => x.trim().replace(/^"|"$/g, ""));
  const n = (h) => h.toLowerCase().replace(/[\s()._-]+/g, "");
  const pick = (hs, re) => hs.findIndex((h) => re.test(n(h)));
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const hs = split(lines[i]);
    const si = pick(hs, /^(stn|station|sta|stat|stationm|chainage)$/), xi = pick(hs, /^(x|gridx|east|easting|utme|e|xutm|utmx)$/), yi = pick(hs, /^(y|gridy|north|northing|utmn|n|yutm|utmy)$/);
    if (si < 0 || xi < 0 || yi < 0) continue;
    const zi = pick(hs, /^(z|elev|elevation|alt|altitude|rl|height|elevm|zm)$/), li = pick(hs, /^(line|lineid|linename)$/);
    const stations = [];
    for (const l of lines.slice(i + 1)) {
      if (!l.trim()) continue;
      const t = split(l);
      const s = stationNumber(t[si]), x = Number(t[xi]), y = Number(t[yi]);
      if (s == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      stations.push({ line: li >= 0 ? t[li] : "", s, x, y, z: zi >= 0 && isNum(t[zi]) ? Number(t[zi]) : null });
    }
    return { stations, other: [], epsg: null, crsNote: "" };
  }
  return null;
}

// -> { lines: { [line]: stations sorted by s }, other, epsg, crsNote } ; throws when nothing is readable.
export function parseStationFile(text, name = "This file") {
  const lines = String(text).split(/\r\n|\r|\n/);
  let res = lines.some((l) => /^W\s/.test(l.trim())) ? parseGpsUtility(lines) : null;
  if (!res || !res.stations.length) res = parseTable(lines) || res;
  if (!res || !res.stations.length) throw new Error(`${name} has no line stations GeoStrix can read (expected GPS waypoints named "<line> <station>", or a table with station, X and Y columns).`);
  const byLine = {};
  for (const st of res.stations) (byLine[st.line] ||= []).push(st);
  for (const k of Object.keys(byLine)) {
    // one position per station (a file can repeat a station); the first wins
    const seen = new Set();
    byLine[k] = byLine[k].sort((a, b) => a.s - b.s).filter((st) => (seen.has(st.s) ? false : seen.add(st.s)));
  }
  return { lines: byLine, other: res.other, epsg: res.epsg, crsNote: res.crsNote };
}

// Which of the file's lines belongs to this DC/IP line: the one whose name appears in the line file's name or
// LINE values ("8575E.dat"), else the only one; null when it can't be told (the panel then asks).
export function matchStationLine(lineNames, ...hints) {
  if (lineNames.length === 1) return lineNames[0];
  const h = hints.filter(Boolean).map((x) => String(x).toLowerCase());
  const hit = lineNames.filter((ln) => ln && h.some((x) => x.includes(ln.toLowerCase())));
  return hit.length ? hit.sort((a, b) => b.length - a.length)[0] : null;
}

// Least-squares straight line through the stations: x = ax + bx·s, y = ay + by·s. The direction is (bx, by) / |·|;
// |(bx, by)| is the CHAINING SCALE — ground metres per file metre (0.985 = the chained distances are 1.5% long,
// common with slope chaining). The start is the fitted position of distance 0, so lineGeometry(start, end, scale)
// puts every station where it was surveyed (residuals = the scatter about that line).
export function fitStationLine(stations) {
  const st = stations.filter((p) => Number.isFinite(p.s) && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (st.length < 2 || st[0].s === st[st.length - 1].s) return null;
  const n = st.length, ms = st.reduce((a, p) => a + p.s, 0) / n, mx = st.reduce((a, p) => a + p.x, 0) / n, my = st.reduce((a, p) => a + p.y, 0) / n;
  let sss = 0, ssx = 0, ssy = 0;
  for (const p of st) { const d = p.s - ms; sss += d * d; ssx += d * (p.x - mx); ssy += d * (p.y - my); }
  const bx = ssx / sss, by = ssy / sss, scale = Math.hypot(bx, by);
  if (!(scale > 0)) return null;
  const u = [bx / scale, by / scale];
  const start = [mx - bx * ms, my - by * ms];
  const sMax = st[st.length - 1].s;
  const end = [start[0] + bx * sMax, start[1] + by * sMax];
  const res = st.map((p) => Math.hypot(p.x - (start[0] + bx * p.s), p.y - (start[1] + by * p.s)));
  // off-line scatter alone (as if the chainage were exact): the perpendicular distance to the fitted line
  const across = st.map((p) => Math.abs((p.x - mx) * -u[1] + (p.y - my) * u[0]));
  const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  return { start, end, u, scale, n, maxResidual: Math.max(...res), rmsResidual: rms(res), maxAcross: Math.max(...across), azimuth: ((Math.atan2(u[0], u[1]) * 180) / Math.PI + 360) % 360 };
}

// Ground profile [[s, z]] from the stations' elevations, extended flat to s0 / s1 (the mesh padding); null with
// fewer than two elevations.
export function stationGroundProfile(stations, s0, s1) {
  const pts = stations.filter((p) => Number.isFinite(p.z) && Number.isFinite(p.s)).map((p) => [p.s, p.z]).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const out = [];
  if (s0 < pts[0][0]) out.push([s0, pts[0][1]]);
  out.push(...pts);
  if (s1 > pts[pts.length - 1][0]) out.push([s1, pts[pts.length - 1][1]]);
  return out;
}
