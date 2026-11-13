// TASKS.csv #2759 — map layers, boundaries / claims and surface samples as GeoJSON (RFC 7946: WGS 84 longitude / latitude, the exterior
// ring counter-clockwise, holes clockwise), beside the KML export (#1025). Points, lines (a MultiLineString for several parts) and
// polygons (rings split where they cross themselves and grouped into polygons with their holes, as the KML writer does: #3126).
// built: lib/overlayExport.js's { features: [{ geometry: [[x, y, z?]], parts?, attributes }], geomType: "point" | "polyline" | "polygon" }
// toLonLat(x, y) -> [lon, lat]; nameOf(f) / colorOf(f) optional, written as the properties "name" and "stroke" (simplestyle) when given.
// Loaded on use, with the export.
import { polygonsFromRings } from "./polygonRings.js";
import { splitRings } from "./ringSplit.js";

const r8 = (v) => Math.round(v * 1e8) / 1e8; // about a millimetre, as the KML (#1251)
const pos = (lon, lat, z) => (Number.isFinite(z) ? [r8(lon), r8(lat), Math.round(z * 100) / 100] : [r8(lon), r8(lat)]);
// twice the signed area in lon / lat: > 0 counter-clockwise
const signedArea = (ring) => { let a = 0; for (let i = 0, n = ring.length; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
const closed = (r) => (r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r : [...r, r[0]]);
const wound = (ring, ccw) => (signedArea(ring) > 0 === ccw ? ring : ring.slice().reverse());

export function featuresToGeoJson({ features, geomType }, { toLonLat, nameOf = null, colorOf = null } = {}) {
  if (!toLonLat) throw new Error("featuresToGeoJson needs a coordinate transform to WGS84");
  const ll = ([x, y, z]) => { const [lon, lat] = toLonLat(x, y); return pos(lon, lat, z); };
  const out = [];
  for (const f of features || []) {
    let geometry = null;
    if (geomType === "point") { if (f.geometry?.[0]) geometry = { type: "Point", coordinates: ll(f.geometry[0]) }; }
    else if (geomType === "polyline") {
      const parts = (f.parts?.length ? f.parts : [f.geometry]).filter((p) => p?.length >= 2).map((p) => p.map(ll));
      if (parts.length === 1) geometry = { type: "LineString", coordinates: parts[0] };
      else if (parts.length > 1) geometry = { type: "MultiLineString", coordinates: parts };
    } else {
      const rings = (f.parts?.length ? f.parts : [f.geometry]).filter((r) => r?.length >= 3).map((r) => r.map(ll));
      const polys = polygonsFromRings(splitRings(rings)).map((rs) => rs.map((r, i) => wound(closed(r), i === 0)));
      if (polys.length === 1) geometry = { type: "Polygon", coordinates: polys[0] };
      else if (polys.length > 1) geometry = { type: "MultiPolygon", coordinates: polys };
    }
    if (!geometry) continue;
    const properties = {};
    for (const [k, v] of Object.entries(f.attributes || {})) if (v !== "" && v != null) properties[k] = v;
    if (nameOf) { const n = nameOf(f); if (n && properties.name == null) properties.name = String(n); }
    if (colorOf) { const c = colorOf(f); if (c && properties.stroke == null) properties.stroke = c; }
    out.push({ type: "Feature", properties, geometry });
  }
  return { text: JSON.stringify({ type: "FeatureCollection", features: out }), count: out.length };
}
