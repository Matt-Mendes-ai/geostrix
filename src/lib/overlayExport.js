// TASKS.csv #1025 (review #1016: QGIS / GIS, Micromine user, exploration geologist, structural geologist) — the map data
// that had no way out of GeoStrix: map layers (geology polygons, contacts, points from SHP / GPKG / TAB / MIF / KML /
// WFS), boundaries and claims, surface samples with their assay values, and outcrop structural measurements. Each is
// turned into the { features, geomType } shape the existing writers take (buildGeoPackage, buildShapefileZip), plus a
// KML writer (reprojected to WGS84 longitude / latitude) and CSV rows. Loaded on demand (ViewerModule /
// SurfaceMappingPanel), like the writers.
import { polygonsFromRings } from "./polygonRings.js";
import { getProj4Def, pointTransform } from "./reproject.js";
import { azimuthToGridOffset, wrap360 } from "./azimuthRef.js";

const num = (v) => (typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v));
const r6 = (v) => Math.round(v * 1e6) / 1e6;

// ---------- map layers ----------
// a multi-point feature becomes one point per part (the writers take one point per feature)
export function mapLayerFeatures(layer) {
  const geomType = layer.geomType === "point" ? "point" : layer.geomType === "polyline" ? "polyline" : "polygon";
  const z = layer.drapeMode === "flat" && Number.isFinite(num(layer.elevation)) ? num(layer.elevation) : 0;
  const pt = ([x, y]) => [x, y, z];
  const features = [];
  (layer.features || []).forEach((f) => {
    const parts = (f.parts || []).filter((p) => p?.length).map((p) => p.map(pt));
    if (!parts.length) return;
    const attributes = { ...(f.attributes || {}) };
    if (geomType === "point") parts.forEach((p) => features.push({ geometry: [p[0]], attributes }));
    else features.push({ geometry: parts[0], parts, attributes });
  });
  return { features, geomType };
}

// ---------- boundaries / claims ----------
// closed loops (the default for a boundary: Geosoft .ply, claims) go out as one polygon with every ring; open lines
// (closedFlags false: a DXF / shapefile line) as one multi-part line. A boundary mixing both is written as lines.
export function boundaryFeatures(b) {
  const lines = (b.polylines || []).map((pl) => pl.map((p) => [num(p.x), num(p.y), num(b.elevation) || 0]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).filter((p) => p.length >= 2);
  if (!lines.length) return { features: [], geomType: "polygon" };
  const closed = (b.closedFlags || []).length ? lines.every((_, i) => b.closedFlags[i] !== false) : true;
  const attributes = { name: b.name || "", kind: b.kind || "boundary" };
  if (closed && lines.every((l) => l.length >= 3)) return { features: [{ geometry: lines[0], parts: lines, attributes }], geomType: "polygon" };
  return { features: [{ geometry: lines[0], parts: lines, attributes }], geomType: "polyline" };
}

// ---------- surface samples ----------
// samples: store.surfaceSamples ({ sample_id, x, y, z, medium, values: { sym: value in its unit }, bdl, nd, attrs });
// elements: store.surfaceElements ([{ symbol, unit }]); anomaly (optional): { result, drawn } from the 3D view, so each
// sample also carries its class. Columns: sample_id, medium, z, then <symbol>_<unit> for every element, the below-
// detection / not-detected lists, then the sample's own extra columns (domain, project, ...).
export function surfaceSampleRows(samples, elements, anomaly = null) {
  const unitCol = (e) => `${e.symbol}_${String(e.unit || "ppm").replace("%", "pct")}`;
  // keyed by id / medium / position: a sample draped on the terrain is a copy in the drawn list (#606)
  const keyOf = (s) => `${s.sample_id ?? ""}|${s.medium ?? ""}|${s.x}|${s.y}`;
  const cls = new Map();
  if (anomaly?.result && anomaly.drawn) anomaly.drawn.forEach((s, i) => {
    const c = anomaly.result.classOf[i];
    cls.set(keyOf(s), { class: c >= 0 ? anomaly.result.classes[c].label : "no value", anomalous: c >= anomaly.result.anomalousFrom ? "yes" : "" });
  });
  return (samples || []).filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y)).map((s) => {
    const row = { sample_id: s.sample_id ?? "", medium: s.medium ?? "", x: s.x, y: s.y, z: Number.isFinite(s.z) ? s.z : "" };
    (elements || []).forEach((e) => { const v = s.values?.[e.symbol]; row[unitCol(e)] = v == null || !Number.isFinite(v) ? "" : v; });
    row.below_detection = (s.bdl || []).join(" ");
    row.not_detected = (s.nd || []).join(" ");
    Object.entries(s.attrs || {}).forEach(([k, v]) => { if (!(k in row)) row[k] = v; });
    const c = cls.get(keyOf(s));
    if (c) { row.anomaly_class = c.class; row.anomalous = c.anomalous; }
    return row;
  });
}
export function surfaceSampleFeatures(samples, elements, anomaly = null) {
  const rows = surfaceSampleRows(samples, elements, anomaly);
  return { features: rows.map(({ x, y, z, ...attributes }) => ({ geometry: [[x, y, z === "" ? 0 : z]], attributes })), geomType: "point" };
}

// ---------- outcrop structures ----------
// set.rows: { x, y, z|null, dip, dipDir (grid, #547), strike, type, cls, comment }. dipdir_true / strike_true use the
// grid convergence at each point (null when the project CRS cannot give it).
export function surfaceStructureRows(set, epsg) {
  return (set.rows || []).filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y)).map((r) => {
    const dd = num(r.dipDir), dip = num(r.dip);
    const off = Number.isFinite(dd) && epsg ? azimuthToGridOffset("true", r.x, r.y, epsg) : null;
    const ddTrue = off ? wrap360(dd - off.offset) : null;
    return {
      x: r.x, y: r.y, z: Number.isFinite(r.z) ? r.z : "",
      cls: r.cls ?? "", type: r.type ?? "",
      dip: Number.isFinite(dip) ? dip : "",
      dipdir_grid: Number.isFinite(dd) ? dd : "",
      strike_rhr_grid: Number.isFinite(dd) ? wrap360(dd - 90) : "",
      dipdir_true: ddTrue != null ? Math.round(ddTrue * 10) / 10 : "",
      strike_rhr_true: ddTrue != null ? Math.round(wrap360(ddTrue - 90) * 10) / 10 : "",
      comment: r.comment ?? "",
    };
  });
}
export function surfaceStructureFeatures(set, epsg) {
  return { features: surfaceStructureRows(set, epsg).map(({ x, y, z, ...attributes }) => ({ geometry: [[x, y, z === "" ? 0 : z]], attributes })), geomType: "point" };
}

// ---------- KML (WGS84) ----------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// "#rrggbb" -> KML aabbggrr
export function kmlColor(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  const h = m ? m[1] : "e2a63c";
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  return `${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`;
}
export async function lonLatTransform(epsg) {
  const e = Number(epsg);
  if (!e) return null;
  if (e === 4326) return (x, y) => [x, y];
  await Promise.all([getProj4Def(e), getProj4Def(4326)]);
  return pointTransform(e, 4326);
}
// { features, geomType } in project coordinates -> KML text. opts: { name, toLonLat, colorOf(f) -> "#rrggbb", nameOf(f),
// headingOf(f) (point icon rotation: a strike symbol), lineColor, fillAlpha }
export function featuresToKml({ features, geomType }, { name = "GeoStrix export", toLonLat, colorOf = () => "#e2a63c", nameOf = () => "", headingOf = null, fillAlpha = 0.35 } = {}) {
  if (!toLonLat) throw new Error("featuresToKml needs a coordinate transform to WGS84");
  const ll = ([x, y, z]) => { const [lon, lat] = toLonLat(x, y); return `${r6(lon)},${r6(lat)},${Number.isFinite(z) ? Math.round(z * 100) / 100 : 0}`; };
  const coords = (ring) => ring.map(ll).join(" ");
  const styles = new Map();
  const styleFor = (hex) => {
    const k = String(hex || "#e2a63c").toLowerCase();
    if (!styles.has(k)) styles.set(k, `s${styles.size}`);
    return styles.get(k);
  };
  const data = (attrs) => {
    const e = Object.entries(attrs || {}).filter(([, v]) => v !== "" && v != null);
    return e.length ? `<ExtendedData>${e.map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join("")}</ExtendedData>` : "";
  };
  const placemarks = features.map((f) => {
    let geom;
    if (geomType === "point") geom = `<Point><coordinates>${ll(f.geometry[0])}</coordinates></Point>`;
    else if (geomType === "polyline") {
      const parts = (f.parts?.length ? f.parts : [f.geometry]).filter((p) => p.length >= 2);
      const one = (p) => `<LineString><tessellate>1</tessellate><coordinates>${coords(p)}</coordinates></LineString>`;
      geom = parts.length === 1 ? one(parts[0]) : `<MultiGeometry>${parts.map(one).join("")}</MultiGeometry>`;
    } else {
      const polys = polygonsFromRings(f.parts?.length ? f.parts : [f.geometry]).map((rs) => rs.map((r) => (r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : [...r, r[0]])));
      const one = ([outer, ...holes]) => `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coords(outer)}</coordinates></LinearRing></outerBoundaryIs>${holes.map((h) => `<innerBoundaryIs><LinearRing><coordinates>${coords(h)}</coordinates></LinearRing></innerBoundaryIs>`).join("")}</Polygon>`;
      geom = polys.length === 1 ? one(polys[0]) : `<MultiGeometry>${polys.map(one).join("")}</MultiGeometry>`;
    }
    const heading = headingOf ? headingOf(f) : null;
    const inline = Number.isFinite(heading) ? `<Style><IconStyle><heading>${Math.round(heading * 10) / 10}</heading></IconStyle></Style>` : "";
    return `    <Placemark><name>${esc(nameOf(f))}</name><styleUrl>#${styleFor(colorOf(f))}</styleUrl>${inline}${data(f.attributes)}${geom}</Placemark>`;
  });
  const styleXml = [...styles].map(([hex, id]) => `    <Style id="${id}"><LineStyle><color>${kmlColor(hex)}</color><width>2</width></LineStyle><PolyStyle><color>${kmlColor(hex, fillAlpha)}</color></PolyStyle><IconStyle><color>${kmlColor(hex)}</color></IconStyle></Style>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${esc(name)}</name>\n${styleXml.join("\n")}\n${placemarks.join("\n")}\n  </Document>\n</kml>\n`;
}

// a map layer's category colour for a feature (its style field), else the layer colour
export function mapLayerColorOf(layer) {
  const byValue = new Map((layer.categories || []).map((c) => [String(c.value), c.color]));
  return (f) => (layer.styleField ? byValue.get(String(f.attributes?.[layer.styleField] ?? "")) : null) || layer.color || "#e2a63c";
}

// DXF takes one vertex list per feature: every part (ring or line piece) becomes its own entity
export function explodeParts({ features, geomType }) {
  return { geomType, features: features.flatMap((f) => (f.parts?.length > 1 ? f.parts.map((p) => ({ ...f, geometry: p, parts: [p] })) : [f])) };
}

export function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
