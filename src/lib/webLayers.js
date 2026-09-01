// TASKS.csv #127 — generic WMS/WFS layer consumption ("many exploration geologists pull government
// geological/geophysical WMS layers — provincial bedrock geology, airborne mag WMS, claim-tenure WFS —
// directly in QGIS"). Deliberately targets the WMS 1.1.1 / WFS 2.0 dialects rather than trying to
// negotiate the "best" version per server: WMS 1.3.0 flips EPSG:4326's axis order to (lat,lon) instead
// of (lon,lat), a well-known interoperability trap real GIS tools spend real code working around —
// 1.1.1's SRS=EPSG:4326 keeps the simple, unambiguous (lon,lat) order every other CRS already uses in
// this app, at the cost of not supporting a hypothetical WMS-1.3.0-only server (in practice extremely
// rare; every major government WMS this was checked against — DataBC, GeoBC, NRCan — serves 1.1.1
// fine). WFS 2.0's outputFormat=application/json (GeoJSON) is likewise the broadly-supported modern
// default rather than parsing GML, which every mainstream WFS server built in the last decade offers.
//
// WMS layers come back as a single rendered image for a chosen area (imported as a `rasters` drape,
// same shape manual GeoTIFF import already produces) since that's what a WMS server actually renders
// server-side — there's no vector geometry to recover from a GetMap response. WFS layers come back as
// real vector features (imported as a `boundaries` polylines layer) since that's exactly what GetFeature
// returns.
import { fetchWebLayerUrl } from "./desktop.js";
import { reprojectXY } from "./reproject.js";

function stripTrailingParams(url) {
  return url.split("?")[0];
}
function buildQuery(baseUrl, params) {
  const base = stripTrailingParams(baseUrl);
  const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  return `${base}?${qs}`;
}

async function fetchText(url) {
  const { arrayBuffer } = await fetchWebLayerUrl(url);
  return new TextDecoder("utf-8").decode(arrayBuffer);
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const errEl = doc.querySelector("parsererror");
  if (errEl) throw new Error("Server response wasn't valid XML — check the URL points at a real WMS/WFS service.");
  // OGC services return HTTP 200 with a ServiceExceptionReport/ExceptionReport body as the WHOLE
  // document (not embedded inside a real one) on a bad request (wrong VERSION, unknown layer, etc) —
  // checked via the document's own ROOT element name, not a query for an <Exception> tag ANYWHERE in
  // the document: a real WMS 1.1.1 GetCapabilities response legitimately contains its own
  // <Capability><Exception><Format>...</Format></Exception></Capability> section (declaring which
  // exception MIME types the server supports), which is a normal capability declaration, not an
  // error — an earlier version of this function matched that element by mistake and reported every
  // successful capabilities fetch as a rejected request.
  const rootName = doc.documentElement?.tagName || doc.documentElement?.nodeName || "";
  if (/ServiceExceptionReport|ExceptionReport/i.test(rootName)) {
    const exc = doc.querySelector("ServiceException, Exception, ExceptionText");
    const msg = exc?.textContent?.trim();
    throw new Error(msg ? `Server rejected the request: ${msg}` : "Server rejected the request.");
  }
  return doc;
}

function text(el, selector) {
  const found = el.querySelector(selector);
  return found ? found.textContent.trim() : null;
}
function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

// ---------------- WMS ----------------

// Returns [{ name, title, abstract, bboxLonLat: [w,s,e,n] | null }] — one entry per <Layer> that has
// its own <Name> (a pure grouping/container Layer with no Name isn't individually requestable via
// GetMap, so it's skipped, matching how a real WMS client's layer tree works).
export async function fetchWmsLayers(baseUrl) {
  const xml = await fetchText(buildQuery(baseUrl, { SERVICE: "WMS", REQUEST: "GetCapabilities", VERSION: "1.1.1" }));
  const doc = parseXml(xml);
  const layerEls = Array.from(doc.querySelectorAll("Layer")).filter((el) => text(el, ":scope > Name"));
  return layerEls.map((el) => {
    const name = text(el, ":scope > Name");
    const title = text(el, ":scope > Title") || name;
    const abstract = text(el, ":scope > Abstract");
    // WMS 1.1.1's own <LatLonBoundingBox minx=".." miny=".." maxx=".." maxy=".."/> is a plain-attribute
    // element (no child text nodes), and — unlike most extent-carrying Layers below it — is often only
    // declared on an ANCESTOR Layer, not repeated on every leaf, so this walks up the tree to the
        // nearest one that has it, same as a real WMS client's inherited-property resolution.

    let bboxEl = el.querySelector(":scope > LatLonBoundingBox");
    let cur = el;
    while (!bboxEl && cur.parentElement && cur.parentElement.tagName === "Layer") {
      cur = cur.parentElement;
      bboxEl = cur.querySelector(":scope > LatLonBoundingBox");
    }
    const bboxLonLat = bboxEl
      ? [num(bboxEl.getAttribute("minx")), num(bboxEl.getAttribute("miny")), num(bboxEl.getAttribute("maxx")), num(bboxEl.getAttribute("maxy"))]
      : null;
    return { name, title, abstract, bboxLonLat: bboxLonLat && bboxLonLat.every((v) => v != null) ? bboxLonLat : null };
  });
}

// Fetches one GetMap image for a lon/lat bbox and returns it as a raster ready for store.addRaster —
// { name, bbox (project EPSG), dataUrl }. `projectEpsg` is used only to reproject the 4 corners of the
// requested lon/lat box into the project's own CRS for positioning the drape plane; the image itself is
// requested and returned exactly as rendered by the server (SRS=EPSG:4326), no pixel reprojection —
// same "reproject the footprint, not the pixels" approach a flat-drape raster already uses elsewhere in
// this app, an acceptable approximation for a single moderate-sized area (not warping-accurate at wide
// extents/high latitudes, but correct in position and scale for the kind of property-scale area this
// is meant to cover).
export async function fetchWmsMapAsRaster({ baseUrl, layerName, bboxLonLat, projectEpsg, width = 1024, height = 1024, transparent = true, format = "image/png" }) {
  const [lonMin, latMin, lonMax, latMax] = bboxLonLat;
  const url = buildQuery(baseUrl, {
    SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.1.1",
    LAYERS: layerName, STYLES: "", SRS: "EPSG:4326",
    BBOX: `${lonMin},${latMin},${lonMax},${latMax}`,
    WIDTH: width, HEIGHT: height, FORMAT: format, TRANSPARENT: transparent ? "TRUE" : "FALSE",
  });
  const { contentType, arrayBuffer } = await fetchWebLayerUrl(url);
  if (contentType.includes("xml") || contentType.includes("text")) {
    // A GetMap failure comes back as an XML exception with an image content-type NOT set — same
    // exception shape GetCapabilities uses, so the same parser/message extraction applies.
    const bodyText = new TextDecoder("utf-8").decode(arrayBuffer);
    let message = "Server rejected the map request — check the layer name and area.";
    try { message = parseXml(bodyText).querySelector("ServiceException, Exception")?.textContent?.trim() || message; } catch { /* fall through to the generic message */ }
    throw new Error(message);
  }
  const b64 = btoa(new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), ""));
  const dataUrl = `data:${contentType || format};base64,${b64}`;
  const corners = [[lonMin, latMin], [lonMax, latMin], [lonMax, latMax], [lonMin, latMax]];
  const projected = corners.map(([lon, lat]) => reprojectXY(lon, lat, 4326, projectEpsg));
  if (projected.some((p) => !p)) throw new Error(`Can't reproject WGS84 into the project's EPSG:${projectEpsg} — unrecognized target CRS.`);
  const xs = projected.map((p) => p.x), ys = projected.map((p) => p.y);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return { name: layerName, bbox, dataUrl };
}

// ---------------- WFS ----------------

// Returns [{ name, title }] — one per <FeatureType>. WFS 2.0's capabilities XML namespaces
// FeatureType/Name/Title under wfs:, but querySelector's implicit namespace-agnostic matching (both
// Chromium's XML parser and this app's other DOMParser-based parsers, e.g. shapefile .prj handling,
// already rely on this) finds them without needing an explicit namespace resolver.
export async function fetchWfsFeatureTypes(baseUrl) {
  const xml = await fetchText(buildQuery(baseUrl, { SERVICE: "WFS", REQUEST: "GetCapabilities", VERSION: "2.0.0" }));
  const doc = parseXml(xml);
  return Array.from(doc.querySelectorAll("FeatureType")).map((el) => ({
    name: text(el, "Name"),
    title: text(el, "Title") || text(el, "Name"),
  })).filter((f) => f.name);
}

// Walks a GeoJSON geometry (Point/LineString/Polygon and their Multi* variants) into this app's
// `polylines: {x,y}[][]` shape, reprojecting every vertex from WGS84 into the project's own CRS. A
// bare Point becomes a single-vertex "loop" — degenerate as a polyline, but round-trips through the
// existing boundary renderer as a dot rather than being silently dropped, which matters for point
// features like a claim-post or a drillhole-collar-style WFS layer.
function geometryToPolylines(geom, projectEpsg) {
  if (!geom) return [];
  const proj = ([lon, lat]) => { const p = reprojectXY(lon, lat, 4326, projectEpsg); return p ? { x: p.x, y: p.y } : null; };
  const ring = (coords) => coords.map(proj).filter(Boolean);
  switch (geom.type) {
    case "Point": return [ring([geom.coordinates])];
    case "MultiPoint": return geom.coordinates.map((c) => ring([c]));
    case "LineString": return [ring(geom.coordinates)];
    case "MultiLineString": return geom.coordinates.map(ring);
    case "Polygon": return geom.coordinates.map(ring); // each ring (outer + holes) as its own loop
    case "MultiPolygon": return geom.coordinates.flatMap((poly) => poly.map(ring));
    default: return [];
  }
}

// Fetches up to `maxFeatures` features from one WFS layer and returns them as one `boundaries`-ready
// entry: { name, polylines }. No server-side spatial filter is applied (WFS servers vary too much in
// BBOX-filter syntax/CRS handling to do this reliably across arbitrary servers) — if `clipBboxLonLat`
// is given, features are filtered CLIENT-SIDE after fetching by discarding any whose own vertices fall
// entirely outside that box, which is exactly right for "don't clutter my view with the whole
// province's claims" without depending on the server understanding a spatial filter at all.
export async function fetchWfsFeaturesAsBoundary({ baseUrl, typeName, projectEpsg, maxFeatures = 2000, clipBboxLonLat = null }) {
  const url = buildQuery(baseUrl, {
    SERVICE: "WFS", REQUEST: "GetFeature", VERSION: "2.0.0",
    TYPENAMES: typeName, OUTPUTFORMAT: "application/json", COUNT: maxFeatures,
  });
  const { contentType, arrayBuffer } = await fetchWebLayerUrl(url);
  const bodyText = new TextDecoder("utf-8").decode(arrayBuffer);
  if (contentType.includes("xml")) throw new Error(parseXml(bodyText).querySelector("ServiceException, Exception")?.textContent?.trim() || "Server rejected the feature request — check the layer name.");
  let geojson;
  try { geojson = JSON.parse(bodyText); } catch { throw new Error("Server didn't return valid GeoJSON — it may not support OUTPUTFORMAT=application/json (try a different layer, or this server may need GML support this app doesn't have)."); }
  const features = geojson.features || [];
  if (!features.length) throw new Error("No features returned for this layer.");
  let polylines = features.flatMap((f) => geometryToPolylines(f.geometry, projectEpsg));
  let clippedCount = 0;
  if (clipBboxLonLat) {
    const [cxMin, cyMin, cxMax, cyMax] = clipBboxLonLat;
    const corner = reprojectXY(cxMin, cyMin, 4326, projectEpsg), corner2 = reprojectXY(cxMax, cyMax, 4326, projectEpsg);
    if (corner && corner2) {
      const xmin = Math.min(corner.x, corner2.x), xmax = Math.max(corner.x, corner2.x);
      const ymin = Math.min(corner.y, corner2.y), ymax = Math.max(corner.y, corner2.y);
      const before = polylines.length;
      polylines = polylines.filter((loop) => loop.some((p) => p.x >= xmin && p.x <= xmax && p.y >= ymin && p.y <= ymax));
      clippedCount = before - polylines.length;
    }
  }
  if (!polylines.length) throw new Error("Every feature fell outside the current project area after clipping — try without clipping, or check this is really the right layer.");
  return { name: typeName, polylines, totalFeatures: features.length, clippedCount };
}
