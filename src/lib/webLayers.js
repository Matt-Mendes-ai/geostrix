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
import { reprojectXY, reprojectImageRGBA, getProj4DefSync } from "./reproject.js";
import { arrMin, arrMax } from "./arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)

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
// requested from the server in EPSG:4326 (WMS 1.1.1, so lon/lat axis order is unambiguous) and then
// warped pixel by pixel into the project CRS (TASKS.csv #418 — see below).
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
  // TASKS.csv #418 — WARP the pixels into the project CRS. The image used to be stretched over the
  // projected bounding box of its four corners, which is only right at the corners: a lon/lat grid is
  // curved and rotated in UTM, so the interior was measured 148 m off over a 10 km area at -130.1 and
  // 1,005 m off over 25 km (EPSG:3156, 56.5N). Same per-pixel warp raster.js already uses for GeoTIFF
  // drapes (#287), fast since the converter caching in #416. Pixels outside the source footprint stay
  // transparent.
  const fromDef = getProj4DefSync(4326), toDef = getProj4DefSync(projectEpsg);
  if (!fromDef || !toDef) throw new Error(`Can't reproject WGS84 into the project's EPSG:${projectEpsg} — unrecognized target CRS.`);
  const blob = new Blob([arrayBuffer], { type: contentType || format });
  const bmp = await createImageBitmap(blob);
  const src = document.createElement("canvas");
  src.width = bmp.width; src.height = bmp.height;
  const sctx = src.getContext("2d");
  sctx.drawImage(bmp, 0, 0);
  const pixels = sctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const rp = reprojectImageRGBA({ xmin: lonMin, ymin: latMin, xmax: lonMax, ymax: latMax, width: bmp.width, height: bmp.height, data: pixels }, fromDef, toDef, bmp.width, bmp.height);
  const out = document.createElement("canvas");
  out.width = rp.width; out.height = rp.height;
  out.getContext("2d").putImageData(new ImageData(rp.data, rp.width, rp.height), 0, 0);
  return { name: layerName, bbox: rp.bbox, dataUrl: out.toDataURL("image/png") };
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
function geometryToPolylines(geom, projectEpsg, fromEpsg = 4326) {
  if (!geom) return [];
  const proj = Number(fromEpsg) === Number(projectEpsg)
    ? ([x, y]) => (Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null)
    : ([x, y]) => { const p = reprojectXY(x, y, fromEpsg, projectEpsg); return p ? { x: p.x, y: p.y } : null; };
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
// TASKS.csv #417 — the request used to name no CRS and no area, and then treated every coordinate as
// lon/lat. DataBC's WFS (the MTO tenure layers #127 was built for) answers in BC Albers (EPSG:3005)
// metres by default, so claims were projected as if metres were degrees; and COUNT with no BBOX returned
// the first N features in the PROVINCE, which the client-side clip then usually threw away entirely.
// Now: ask for the project's own CRS (a projected CRS has no axis-order ambiguity) and a BBOX of the
// area in that CRS; read the CRS the server says it used (GeoJSON `crs`) and reproject from it. If the
// server refuses those parameters, fall back to the plain request and refuse coordinates that are
// clearly not lon/lat when the server doesn't say what they are, instead of drawing them wrong.
function epsgFromCrsName(name) {
  const m = /EPSG(?::+|\/)(\d+)/i.exec(String(name || ""));
  return m ? Number(m[1]) : null;
}
async function wfsGetFeature(baseUrl, params) {
  const { contentType, arrayBuffer } = await fetchWebLayerUrl(buildQuery(baseUrl, params));
  const bodyText = new TextDecoder("utf-8").decode(arrayBuffer);
  if (contentType.includes("xml")) throw Object.assign(new Error(parseXml(bodyText).querySelector("ServiceException, Exception")?.textContent?.trim() || "Server rejected the feature request — check the layer name."), { serverRejected: true });
  try { return JSON.parse(bodyText); } catch { throw new Error("Server didn't return valid GeoJSON — it may not support OUTPUTFORMAT=application/json (try a different layer, or this server may need GML support this app doesn't have)."); }
}
export async function fetchWfsFeaturesAsBoundary({ baseUrl, typeName, projectEpsg, maxFeatures = 2000, clipBboxLonLat = null }) {
  const base = { SERVICE: "WFS", REQUEST: "GetFeature", VERSION: "2.0.0", TYPENAMES: typeName, OUTPUTFORMAT: "application/json", COUNT: maxFeatures };
  let areaProj = null;
  if (clipBboxLonLat && projectEpsg && ![4326, 4269, 4617, 4258, 4283].includes(Number(projectEpsg))) {
    const [cxMin, cyMin, cxMax, cyMax] = clipBboxLonLat;
    const pts = [[cxMin, cyMin], [cxMax, cyMin], [cxMax, cyMax], [cxMin, cyMax]].map(([x, y]) => reprojectXY(x, y, 4326, projectEpsg));
    if (pts.every(Boolean)) areaProj = [arrMin(pts.map((q) => q.x)), arrMin(pts.map((q) => q.y)), arrMax(pts.map((q) => q.x)), arrMax(pts.map((q) => q.y))];
  }
  let geojson, askedEpsg = null, usedServerFilter = false;
  // Geographic project CRSs are skipped here: WFS 2.0 puts their axes lat/lon, which servers disagree on.
  const projected = projectEpsg && ![4326, 4269, 4617, 4258, 4283].includes(Number(projectEpsg));
  if (projected) {
    try {
      geojson = await wfsGetFeature(baseUrl, {
        ...base, SRSNAME: `urn:ogc:def:crs:EPSG::${projectEpsg}`,
        ...(areaProj ? { BBOX: `${areaProj.join(",")},urn:ogc:def:crs:EPSG::${projectEpsg}` } : {}),
      });
      askedEpsg = Number(projectEpsg); usedServerFilter = !!areaProj;
    } catch (err) {
      if (!err.serverRejected) throw err;
      geojson = null; // server doesn't accept SRSNAME/BBOX — plain request below
    }
  }
  if (!geojson) geojson = await wfsGetFeature(baseUrl, base);
  const features = geojson.features || [];
  if (!features.length) throw new Error(usedServerFilter ? "No features of this layer fall inside the project area." : "No features returned for this layer.");
  // Which CRS are these coordinates in? The server's own statement wins, then what we asked for, then
  // WGS84 only if the numbers actually look like degrees.
  let fromEpsg = epsgFromCrsName(geojson.crs?.properties?.name) || askedEpsg;
  if (!fromEpsg) {
    const first = features.find((f) => f.geometry)?.geometry;
    const probe = JSON.stringify(first?.coordinates || []).match(/-?\d+(\.\d+)?/g)?.slice(0, 2).map(Number) || [];
    if (probe.some((v) => Math.abs(v) > 180)) throw new Error("This server returned projected coordinates (metres) without saying which coordinate system they are in, so they can't be placed correctly. Try another layer or server.");
    fromEpsg = 4326;
  }
  let polylines = features.flatMap((f) => geometryToPolylines(f.geometry, projectEpsg, fromEpsg));
  let clippedCount = 0;
  // #417 — when the server already filtered by BBOX, its answer is "features that intersect the area";
  // re-clipping by "has a vertex inside" threw away big claims that cross the area (31 of 192 in a live
  // DataBC test). Without a server filter, clip by bounding-box OVERLAP for the same reason.
  if (clipBboxLonLat && !usedServerFilter) {
    const [cxMin, cyMin, cxMax, cyMax] = clipBboxLonLat;
    const corner = reprojectXY(cxMin, cyMin, 4326, projectEpsg), corner2 = reprojectXY(cxMax, cyMax, 4326, projectEpsg);
    if (corner && corner2) {
      const xmin = Math.min(corner.x, corner2.x), xmax = Math.max(corner.x, corner2.x);
      const ymin = Math.min(corner.y, corner2.y), ymax = Math.max(corner.y, corner2.y);
      const before = polylines.length;
      polylines = polylines.filter((loop) => {
        let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
        for (const p of loop) { if (p.x < lx0) lx0 = p.x; if (p.x > lx1) lx1 = p.x; if (p.y < ly0) ly0 = p.y; if (p.y > ly1) ly1 = p.y; }
        return lx1 >= xmin && lx0 <= xmax && ly1 >= ymin && ly0 <= ymax;
      });
      clippedCount = before - polylines.length;
    }
  }
  if (!polylines.length) throw new Error("Every feature fell outside the current project area after clipping — try without clipping, or check this is really the right layer.");
  return { name: typeName, polylines, totalFeatures: features.length, clippedCount };
}
