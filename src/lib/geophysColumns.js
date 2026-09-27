// TASKS.csv #484 — which CSV columns hold a point survey's x / y / z / value. The first version only accepted
// EXACT header names (x, easting, mag, reading...), so a real ground-mag export with "Easting_X, Northing_Y,
// Elevation_Z, Raw_Mag_nT" was refused ("No usable rows found"). Headers are now split into words
// (Raw_Mag_nT -> raw, mag, nt; TMI_corr -> tmi, corr; EastingUTM -> easting, utm) and matched on those,
// exact names still winning. When a file has several plausible value channels, a processed one (corrected /
// levelled / residual...) is preferred over a raw one, and the caller is told which column it used.
// Anything that can't be matched falls back to the column picker, never a dead end.

// "Raw_Mag_nT" -> ["raw", "mag", "nt"]; "EastingUTM" -> ["easting", "utm"]; "X(m)" -> ["x", "m"]
export function headerWords(h) {
  return String(h ?? "")
    .replace(/([a-z])([A-Z][a-z]|[A-Z]{2,})/g, "$1 $2") // MagRaw, EastingUTM — but not the unit in "nT"
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const ROLES = {
  x: { exact: ["x", "easting", "east", "utm_e", "utme", "e"], words: ["x", "easting", "east", "utme", "lon", "long", "longitude"] },
  y: { exact: ["y", "northing", "north", "utm_n", "utmn", "n"], words: ["y", "northing", "north", "utmn", "lat", "latitude"] },
  // not "alt"/"altitude": a radar/laser altimeter is height above ground, not an elevation (#451 handles AGL)
  z: { exact: ["z", "elevation", "elev"], words: ["z", "elevation", "elev", "rl"] },
  value: {
    exact: ["value", "val", "reading", "mag", "response"],
    words: ["value", "val", "reading", "response", "mag", "magnetic", "tmi", "rmi", "nt", "grav", "gravity", "bouguer", "cba", "res", "resistivity", "rho", "chargeability", "ip", "k", "th", "u", "tc", "dose", "susc", "susceptibility", "cond", "conductivity", "em"],
  },
  line: { exact: ["line", "line_no", "lineno", "line_number", "flight_line", "flightline"], words: ["line", "flightline"] },
  fid: { exact: ["fid", "fiducial", "fiducial_no"], words: ["fid", "fiducial"] },
  label: { exact: ["label", "channel", "field", "survey"], words: [] },
};
// Never the value column: identifiers, QC, time, geometry and instrument housekeeping.
const NOT_VALUE = ["id", "station", "stn", "flag", "qc", "time", "date", "hour", "utc", "gps", "sat", "sats", "hdop", "line", "fid", "fiducial", "x", "y", "z", "easting", "northing", "east", "north", "elevation", "elev", "lat", "lon", "long", "latitude", "longitude", "alt", "altitude", "height", "agl", "radar", "laser", "base", "diurnal", "heading", "speed", "error", "err", "std", "sd", "count", "number", "no", "index", "quality", "signal"];
const GEOGRAPHIC = ["lon", "long", "longitude", "lat", "latitude"];
const PROCESSED = ["corr", "corrected", "lev", "levelled", "leveled", "final", "residual", "res", "rtp", "filtered", "reduced", "processed", "igrf", "tie"];

function pick(headers, role, taken) {
  const r = ROLES[role];
  const free = headers.filter((h) => !taken.has(h));
  const exact = free.find((h) => r.exact.includes(String(h).trim().toLowerCase()));
  if (exact) return { col: exact, candidates: [exact] };
  let cands = free.filter((h) => headerWords(h).some((w) => r.words.includes(w)));
  if (role === "value") cands = cands.filter((h) => !headerWords(h).some((w) => NOT_VALUE.includes(w)));
  else if (role === "x" || role === "y") cands = cands.filter((h) => !headerWords(h).some((w) => ["id", "station", "stn", "line", "offset", "error", "err"].includes(w)));
  if (!cands.length) return { col: "", candidates: [] };
  if (role === "x" || role === "y") { // projected coordinates first; longitude/latitude only when that is all there is
    const projected = cands.filter((h) => !headerWords(h).some((w) => GEOGRAPHIC.includes(w)));
    if (projected.length) return { col: projected[0], candidates: cands };
  }
  if (role === "value" && cands.length > 1) {
    const processed = cands.filter((h) => headerWords(h).some((w) => PROCESSED.includes(w)) && !headerWords(h).includes("raw"));
    if (processed.length) return { col: processed[0], candidates: cands };
    const notRaw = cands.filter((h) => !headerWords(h).includes("raw"));
    if (notRaw.length) return { col: notRaw[0], candidates: cands };
  }
  return { col: cands[0], candidates: cands };
}

// -> { x, y, z, value, line, fid, label } column names ("" = not found), plus valueCandidates (every column
// that looked like a measurement), ok (x, y and value all found) and geographic (x/y are longitude/latitude).
export function guessGeophysColumns(headers) {
  const hs = (headers || []).filter((h) => h != null && String(h).trim() !== "");
  const taken = new Set();
  const out = {};
  for (const role of ["x", "y", "z", "line", "fid", "label", "value"]) {
    const { col, candidates } = pick(hs, role, taken);
    out[role] = col;
    if (col) taken.add(col);
    if (role === "value") out.valueCandidates = candidates;
  }
  out.ok = !!(out.x && out.y && out.value);
  // x/y are longitude/latitude: the caller reprojects from WGS84 (EPSG:4326) unless told otherwise
  out.geographic = !!(out.x && out.y && [out.x, out.y].every((c) => headerWords(c).some((w) => GEOGRAPHIC.includes(w))));
  return out;
}

const num = (v) => (v === "" || v == null ? NaN : typeof v === "number" ? v : Number(String(v).trim()));

// Rows -> point-survey points with the chosen columns (z blank/missing -> null, #365; line / fid kept, #327).
export function rowsToGeophysPoints(rows, cols) {
  return rows.map((r) => {
    const z = cols.z ? num(r[cols.z]) : NaN;
    const line = cols.line ? r[cols.line] : undefined;
    const fid = cols.fid ? r[cols.fid] : undefined;
    const label = cols.label ? r[cols.label] : undefined;
    return {
      x: num(r[cols.x]), y: num(r[cols.y]), z: Number.isFinite(z) ? z : null, value: num(r[cols.value]),
      label: label !== undefined && label !== "" ? String(label) : undefined,
      ...(line !== undefined && line !== "" ? { line: String(line) } : {}),
      ...(fid !== undefined && fid !== "" ? { fid: Number.isFinite(Number(fid)) ? Number(fid) : String(fid) } : {}),
    };
  });
}
