// TASKS.csv #424 — KML / KMZ import: the commonest way claim outlines (BC Mineral Titles Online,
// Google Earth) and field waypoints (phones, handheld GPS apps) arrive. KML coordinates are ALWAYS
// WGS84 longitude,latitude[,altitude] (OGC KML 2.2), so, unlike shapefiles, the source CRS is known and
// callers reproject to the project CRS without asking.
//
// A small tolerant text reader rather than DOMParser, so the same code runs in Node for tests and in
// the renderer. It reads every Placemark: its <name>, <description>, ExtendedData (<Data name><value>
// and <SimpleData name>), and every Point / LineString / LinearRing / Polygon (outer AND inner rings)
// inside it, including inside MultiGeometry. gx:Track, NetworkLink, overlays and styles are ignored
// (and counted, so the caller can say so).
import { readZipEntries } from "./shapefile.js";
import { reprojectXY } from "./reproject.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

const decode = (s) => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
  .trim();
// Tag names may carry a namespace prefix (kml:Placemark) — match either.
const tag = (name) => `(?:[\\w-]+:)?${name}`;
const firstText = (xml, name) => {
  const m = xml.match(new RegExp(`<${tag(name)}\\b[^>]*>([\\s\\S]*?)</${tag(name)}>`, "i"));
  return m ? decode(m[1]) : "";
};
// TASKS.csv #705 — tuples are "lon,lat[,alt]" separated by whitespace. A space after the comma ("-121.30, 52.30, 0",
// written by hand edits, some GPS apps and spreadsheet exports; Google Earth and GDAL read it) used to split each
// tuple in pieces, and Number("") = 0 turned them into extra vertices at latitude 0 — a claim placed 20,000 km
// away with no notice. Spaces around commas are closed up first; a tuple must be 2-3 numbers in range, and any
// that is not is counted (`bad`) instead of being coerced.
function parseCoords(text) {
  const coords = [];
  let bad = 0;
  decode(text).replace(/\s*,\s*/g, ",").split(/\s+/).filter(Boolean).forEach((t) => {
    const parts = t.split(",");
    const nums = parts.map((p) => (p === "" ? NaN : Number(p)));
    if (parts.length < 2 || parts.length > 3 || nums.some((v) => !Number.isFinite(v)) || Math.abs(nums[0]) > 180 || Math.abs(nums[1]) > 90) { bad++; return; }
    coords.push(nums.length === 3 ? nums : [nums[0], nums[1]]);
  });
  return { coords, bad };
}

export function parseKML(text) {
  const src = String(text);
  const features = [];
  let skipped = 0, badTuples = 0; // #705
  const pmRe = new RegExp(`<${tag("Placemark")}\\b[^>]*>([\\s\\S]*?)</${tag("Placemark")}>`, "gi");
  let m;
  let nPlacemark = 0;
  while ((m = pmRe.exec(src))) {
    nPlacemark++;
    const body = m[1];
    const name = firstText(body, "name");
    const description = firstText(body, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const attrs = {};
    const dataRe = new RegExp(`<${tag("Data")}\\b[^>]*name="([^"]*)"[^>]*>[\\s\\S]*?<${tag("value")}>([\\s\\S]*?)</${tag("value")}>`, "gi");
    let d; while ((d = dataRe.exec(body))) attrs[decode(d[1])] = decode(d[2]);
    const sdRe = new RegExp(`<${tag("SimpleData")}\\b[^>]*name="([^"]*)"[^>]*>([\\s\\S]*?)</${tag("SimpleData")}>`, "gi");
    while ((d = sdRe.exec(body))) attrs[decode(d[1])] = decode(d[2]);
    let found = 0;
    const geomRe = new RegExp(`<(${tag("Point")}|${tag("LineString")}|${tag("LinearRing")})\\b[^>]*>([\\s\\S]*?)</\\1>`, "gi");
    let g;
    while ((g = geomRe.exec(body))) {
      const kind = g[1].replace(/^[\w-]+:/, "");
      const { coords, bad } = parseCoords(firstText(g[2], "coordinates"));
      badTuples += bad;
      if (!coords.length) continue;
      found++;
      features.push({ name, description, attrs, placemark: nPlacemark, geomType: kind === "Point" ? "point" : kind === "LinearRing" ? "polygon" : "line", coords });
    }
    if (!found) skipped++;
  }
  return { features, skipped, badTuples };
}

// KMZ = a zip with doc.kml (or any .kml) at its root.
export async function parseKMZ(bytes) {
  const entries = await readZipEntries(bytes, /\.kml$/i);
  const names = Object.keys(entries).filter((n) => entries[n] && /\.kml$/i.test(n));
  if (!names.length) throw new Error(tr("No .kml document found inside this .kmz."));
  const main = names.find((n) => /(^|\/)doc\.kml$/i.test(n)) || names[0];
  return parseKML(new TextDecoder().decode(entries[main]));
}

export async function readKmlFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".kmz")) return parseKMZ(new Uint8Array(await file.arrayBuffer()));
  return parseKML(await file.text());
}

// TASKS.csv #1247 — a drawn map or a showings list from Google Earth as map layers, one per geometry kind, in longitude / latitude like GPX and GeoJSON (#1106).
// A placemark's rings stay one feature: its inner boundaries are holes, not polygons of their own. MultiGeometry lines and points of one placemark stay separate features.
export function kmlToMapLayers(features) {
  const attributes = (f) => ({ ...(f.name ? { name: f.name } : {}), ...(f.description ? { description: f.description } : {}), ...f.attrs });
  const xy = (c) => c.map(([lon, lat]) => [lon, lat]);
  const by = { point: [], polyline: [], polygon: [] }, rings = new Map();
  for (const f of features) {
    if (f.geomType === "point") by.point.push({ parts: [xy(f.coords)], attributes: attributes(f) });
    else if (f.geomType === "line") by.polyline.push({ parts: [xy(f.coords)], attributes: attributes(f) });
    else if (rings.has(f.placemark)) rings.get(f.placemark).parts.push(xy(f.coords));
    else { const p = { parts: [xy(f.coords)], attributes: attributes(f) }; rings.set(f.placemark, p); by.polygon.push(p); }
  }
  const names = { point: "points", polyline: "lines", polygon: "polygons" };
  return Object.keys(by).filter((k) => by[k].length).map((k) => ({ name: names[k], geomType: k, epsg: 4326, features: by[k] }));
}

// Lines/rings as {x, y, z?} polylines in the project CRS (for boundaries and claims). Returns null
// polylines entry for any point that can't be reprojected; `failed` counts them.
export function kmlToProjectPolylines(features, epsg, { includePoints = false } = {}) {
  const polylines = [];
  let failed = 0;
  features.forEach((f) => {
    if (f.geomType === "point" && !includePoints) return;
    const pts = [];
    for (const [lon, lat, alt] of f.coords) {
      const p = epsg ? reprojectXY(lon, lat, 4326, epsg) : { x: lon, y: lat };
      if (!p) { failed++; return; }
      pts.push(Number.isFinite(alt) ? { x: p.x, y: p.y, z: alt } : { x: p.x, y: p.y });
    }
    if (pts.length) polylines.push(pts);
  });
  return { polylines, failed };
}

// Flat rows for the general vector importer (lon/lat, left for its own source-CRS reprojection as
// EPSG:4326): points one row each; line/polygon vertices one row each with part + vertex numbers.
export function kmlFeaturesToRows(features) {
  const rows = [];
  const attrKeys = new Set();
  features.forEach((f) => Object.keys(f.attrs).forEach((k) => attrKeys.add(k)));
  features.forEach((f, part) => {
    f.coords.forEach(([lon, lat, alt], vi) => {
      const row = { name: f.name, x: lon, y: lat, z: Number.isFinite(alt) ? alt : "" };
      if (f.geomType !== "point") { row.part = part + 1; row.vertex = vi + 1; row.geometry = f.geomType; }
      attrKeys.forEach((k) => { row[k] = f.attrs[k] ?? ""; });
      if (f.description) row.description = f.description;
      rows.push(row);
    });
  });
  return { rows, headers: rows.length ? Object.keys(rows[0]) : [] };
}
