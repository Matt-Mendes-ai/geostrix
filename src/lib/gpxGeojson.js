// TASKS.csv #1106 (review #1016, QGIS / GIS) — GPX and GeoJSON in the Map layers and Boundaries / Claims importers.
// GeoStrix wrote GPX for the field (survey plan, follow-up reaches, rig) but could not read back what the crew walked:
// a Garmin's traverse tracks and sample waypoints. Both formats are WGS 84 longitude / latitude (GPX 1.1 always;
// GeoJSON per RFC 7946, except an old-style "crs" member naming an EPSG code, which is honoured), so the layers carry
// epsg 4326 and the importers reproject them as they do KML.
//
// Layers come out in the map-layer shape (lib/mapLayers.js normalizeMapLayer): { name, geomType: "point" | "polyline" |
// "polygon", epsg, features: [{ parts: [[[x, y], ...], ...], attributes }], skippedCount }, one layer per geometry kind
// (a map layer has one). A tolerant text reader as kml.js, so it runs in Node for the tests and in the renderer.
import { t as tr } from "./i18n.js"; // TASKS.csv #786

const decode = (s) => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
  .trim();
const tag = (name) => `(?:[\\w-]+:)?${name}`;
const firstText = (xml, name) => {
  const m = xml.match(new RegExp(`<${tag(name)}\\b[^>]*>([\\s\\S]*?)</${tag(name)}>`, "i"));
  return m ? decode(m[1]) : "";
};
const attr = (open, name) => { const m = open.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i")); return m ? Number(m[1]) : NaN; };
const okLonLat = (lon, lat) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;

// a GPX point element (wpt / trkpt / rtept): its lon / lat, and the child fields kept as attributes
function gpxPoint(open, body) {
  const lon = attr(open, "lon"), lat = attr(open, "lat");
  if (!okLonLat(lon, lat)) return null;
  const ele = Number(firstText(body, "ele"));
  return { lon, lat, ele: firstText(body, "ele") !== "" && Number.isFinite(ele) ? ele : null, name: firstText(body, "name"), desc: firstText(body, "desc") || firstText(body, "cmt"), time: firstText(body, "time"), sym: firstText(body, "sym"), type: firstText(body, "type") };
}
const ptRe = (name) => new RegExp(`(<${tag(name)}\\b[^>]*?)(?:/>|>([\\s\\S]*?)</${tag(name)}>)`, "gi");

export function parseGPX(text) {
  const src = String(text);
  if (!/<(?:[\w-]+:)?gpx\b/i.test(src)) throw new Error(tr("This file is not GPX (no <gpx> element)."));
  let skipped = 0;
  const waypoints = [];
  let m;
  const wre = ptRe("wpt");
  while ((m = wre.exec(src))) { const p = gpxPoint(m[1], m[2] || ""); if (p) waypoints.push(p); else skipped++; }
  const lines = []; // { kind: "track" | "route", name, desc, type, points }
  const collect = (outer, inner, kind) => {
    const re = new RegExp(`<${tag(outer)}\\b[^>]*>([\\s\\S]*?)</${tag(outer)}>`, "gi");
    let o;
    while ((o = re.exec(src))) {
      const body = o[1];
      // the track's own name / desc, not a point's: read from the body with the points taken out
      const head = body.replace(ptRe(inner), "");
      const segs = kind === "track" ? [...body.matchAll(new RegExp(`<${tag("trkseg")}\\b[^>]*>([\\s\\S]*?)</${tag("trkseg")}>`, "gi"))].map((s) => s[1]) : [body];
      for (const seg of segs) {
        const pts = [];
        let p; const pre = ptRe(inner);
        while ((p = pre.exec(seg))) { const q = gpxPoint(p[1], p[2] || ""); if (q) pts.push(q); else skipped++; }
        if (pts.length >= 2) lines.push({ kind, name: firstText(head, "name"), desc: firstText(head, "desc"), type: firstText(head, "type"), points: pts });
        else if (pts.length) skipped++;
      }
    }
  };
  collect("trk", "trkpt", "track");
  collect("rte", "rtept", "route");
  return { waypoints, lines, skipped };
}

// -> map layers: waypoints (points) and tracks / routes (lines), whichever the file has
export function gpxToLayers({ waypoints, lines, skipped = 0 }) {
  const layers = [];
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""));
  if (waypoints.length) layers.push({ name: "waypoints", geomType: "point", epsg: 4326, skippedCount: skipped,
    features: waypoints.map((w) => ({ parts: [[[w.lon, w.lat]]], z: w.ele, attributes: clean({ name: w.name, desc: w.desc, ele: w.ele, time: w.time, sym: w.sym, type: w.type }) })) });
  if (lines.length) layers.push({ name: "tracks", geomType: "polyline", epsg: 4326, skippedCount: waypoints.length ? 0 : skipped,
    features: lines.map((l) => ({ parts: [l.points.map((p) => [p.lon, p.lat])], zs: l.points.map((p) => p.ele), attributes: clean({ name: l.name, desc: l.desc, type: l.type, kind: l.kind, points: l.points.length, start: l.points[0].time, end: l.points[l.points.length - 1].time }) })) });
  return layers;
}

// GeoJSON: a FeatureCollection, a Feature or a bare geometry; Multi* and GeometryCollection are split into parts of
// one feature. -> map layers, one per geometry kind present
export function parseGeoJSON(text) {
  let doc;
  try { doc = typeof text === "string" ? JSON.parse(text) : text; } catch { throw new Error(tr("This file is not valid GeoJSON (it does not parse as JSON).")); }
  if (!doc || typeof doc !== "object") throw new Error(tr("This file is not GeoJSON."));
  // RFC 7946 is WGS 84; the 2008 spec's "crs" member (still written by some tools) may name another EPSG code
  const crsName = doc.crs?.properties?.name || "";
  const cm = String(crsName).match(/EPSG:{1,2}(\d+)/i);
  const epsg = cm ? Number(cm[1]) : /CRS84/i.test(crsName) || !crsName ? 4326 : null;
  const feats = doc.type === "FeatureCollection" ? doc.features || [] : doc.type === "Feature" ? [doc] : doc.type ? [{ type: "Feature", geometry: doc, properties: {} }] : [];
  const by = { point: [], polyline: [], polygon: [] };
  let skipped = 0;
  const num = (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
  const add = (g, attributes) => {
    if (!g) { skipped++; return; }
    const t = g.type, c = g.coordinates;
    if (t === "GeometryCollection") { (g.geometries || []).forEach((x) => add(x, attributes)); return; }
    let kind, parts;
    if (t === "Point" && num(c)) { kind = "point"; parts = [[[c[0], c[1]]]]; }
    else if (t === "MultiPoint" && Array.isArray(c)) { c.filter(num).forEach((p) => by.point.push({ parts: [[[p[0], p[1]]]], attributes })); return; }
    else if (t === "LineString" && Array.isArray(c)) { kind = "polyline"; parts = [c.filter(num).map((p) => [p[0], p[1]])]; }
    else if (t === "MultiLineString" && Array.isArray(c)) { kind = "polyline"; parts = c.map((l) => (l || []).filter(num).map((p) => [p[0], p[1]])); }
    else if (t === "Polygon" && Array.isArray(c)) { kind = "polygon"; parts = c.map((r) => (r || []).filter(num).map((p) => [p[0], p[1]])); }
    else if (t === "MultiPolygon" && Array.isArray(c)) { kind = "polygon"; parts = c.flatMap((poly) => (poly || []).map((r) => (r || []).filter(num).map((p) => [p[0], p[1]]))); }
    else { skipped++; return; }
    parts = parts.filter((p) => p.length >= (kind === "point" ? 1 : 2));
    if (!parts.length) { skipped++; return; }
    by[kind].push({ parts, attributes });
  };
  for (const f of feats) {
    const props = f?.properties && typeof f.properties === "object" ? f.properties : {};
    const attributes = Object.fromEntries(Object.entries(props).filter(([, v]) => v == null || typeof v !== "object").map(([k, v]) => [k, v ?? ""]));
    if (f?.id != null && attributes.id == null) attributes.id = f.id;
    add(f?.geometry, attributes);
  }
  const names = { point: "points", polyline: "lines", polygon: "polygons" };
  const layers = Object.entries(by).filter(([, l]) => l.length).map(([geomType, features], i) => ({ name: names[geomType], geomType, epsg, features, skippedCount: i === 0 ? skipped : 0 }));
  return { layers, epsg, skipped, crsNamed: crsName || null };
}

// lines and polygon rings of map layers as boundary polylines [{x, y}] in the project CRS. reproject(x, y, from, to)
// -> {x, y} | null is passed in (lib/reproject.js reprojectXY) so this file stays dependency-free.
export function layersToBoundaryPolylines(layers, epsg, reproject) {
  const polylines = [];
  let failed = 0;
  for (const l of layers) {
    if (l.geomType === "point") continue;
    const from = l.epsg || 4326;
    for (const f of l.features) for (const part of f.parts) {
      const pts = [];
      for (const [x, y] of part) {
        const p = epsg && from !== Number(epsg) ? reproject(x, y, from, Number(epsg)) : { x, y };
        if (!p) { failed++; continue; }
        pts.push({ x: p.x, y: p.y });
      }
      if (pts.length >= 2) polylines.push(pts);
    }
  }
  return { polylines, failed };
}
