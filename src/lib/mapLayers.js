// TASKS.csv #316/#317/#318 — surface mapping data: GIS map layers (GeoPackage / shapefile polygons,
// lines, points) styled by an attribute, draped onto the DTM; outcrop structural measurements; and the
// geometry needed to project mapped geology underground (unit-to-unit contact traces, dip projection).
//
// Matt's request: "we need a way to import surface mapping data and use that do project surface geology
// underground, also we should be able to drape shape files and geopackages onto the DTM/SRTM".
//
// Everything in this file is pure (no React, no three.js) so it can be checked in plain Node. The only
// canvas dependency is drawMapLayer, which is handed a 2D context by the caller.
//
// WHY A MAP IS DRAPED AS A TEXTURE, NOT AS TRIANGULATED POLYGONS. A filled polygon triangulated in plan
// and then pushed onto the terrain only follows the ground at its own vertices — a 400 m polygon edge
// with two vertices cuts straight through every ridge and valley between them, and would have to be
// re-tessellated against the terrain grid to sit on it. Rasterizing the map into an image and draping
// that image on a terrain-conforming grid (the exact path GeoTIFF rasters already take, #81) follows
// the ground everywhere at the terrain's own resolution, costs one draw call however many polygons the
// map has, and handles holes and multipart units for free via the even-odd fill rule. The cost is a
// finite texel size, chosen per layer below (~1 m/px, capped).

// ---------- .qml (QGIS layer style) ----------

// QGIS writes colours as "r,g,b,a" optionally followed by ",rgb:..." / ",hsv:..." — the first four
// integers are always the 8-bit RGBA, whatever colour model follows.
function qmlColor(value) {
  if (!value) return null;
  const m = String(value).match(/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+))?/);
  if (!m) return null;
  const hex = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
  return { hex: `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`, alpha: m[4] == null ? 1 : Number(m[4]) / 255 };
}

function xmlAttr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decodeXmlEntities(m[1]) : null;
}
function decodeXmlEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Parses the categorized-symbol renderer out of a QGIS .qml. Deliberately a tolerant regex reader rather
// than DOMParser, so it runs identically in Node (for verification) and the renderer, and a .qml with
// sections this doesn't understand (labels, forms, 3D, QField config — the sample has all of these) is
// simply ignored rather than rejected. Returns null when the file has no categorized renderer (a single-
// symbol or graduated style) — the caller keeps its auto-generated colours in that case.
//
// { field, categories: [{ value, label, color, outline, visible }], opacity }
export function parseQmlStyle(text) {
  if (!text) return null;
  const rendererMatch = text.match(/<renderer-v2\b[^>]*>/);
  if (!rendererMatch) return null;
  const rendererTag = rendererMatch[0];
  if (xmlAttr(rendererTag, "type") !== "categorizedSymbol") return null;
  const field = xmlAttr(rendererTag, "attr");
  const rendererBody = text.slice(rendererMatch.index, text.indexOf("</renderer-v2>", rendererMatch.index));

  // <symbols> holds one <symbol name="N"> per category. The FIRST symbol layer's fill/line/marker colour
  // is taken; multi-layer symbols (a fill plus a hatch overlay) are reduced to that base colour.
  const symbolsStart = rendererBody.indexOf("<symbols>");
  const symbolsEnd = rendererBody.indexOf("</symbols>");
  const symbolColors = {};
  if (symbolsStart >= 0 && symbolsEnd > symbolsStart) {
    const symbolsBody = rendererBody.slice(symbolsStart, symbolsEnd);
    const re = /<symbol\b[^>]*>/g;
    let m;
    const starts = [];
    while ((m = re.exec(symbolsBody))) starts.push({ index: m.index, tag: m[0] });
    starts.forEach((s, i) => {
      const body = symbolsBody.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : symbolsBody.length);
      const opt = (name) => {
        const om = body.match(new RegExp(`<Option[^>]*name="${name}"[^>]*value="([^"]*)"`)) || body.match(new RegExp(`<Option[^>]*value="([^"]*)"[^>]*name="${name}"`));
        return om ? qmlColor(om[1]) : null;
      };
      const fill = opt("color") || opt("line_color");
      const outline = opt("outline_color");
      const symAlpha = Number(xmlAttr(s.tag, "alpha") ?? 1);
      symbolColors[xmlAttr(s.tag, "name")] = { fill, outline, alpha: Number.isFinite(symAlpha) ? symAlpha : 1 };
    });
  }

  const categories = [];
  const catRe = /<category\b[^>]*\/?>/g;
  let cm;
  while ((cm = catRe.exec(rendererBody))) {
    const tag = cm[0];
    const type = xmlAttr(tag, "type");
    const value = type === "NULL" ? null : xmlAttr(tag, "value");
    const sym = symbolColors[xmlAttr(tag, "symbol")] || {};
    const label = xmlAttr(tag, "label");
    categories.push({
      value,
      label: label || (value == null ? "(no value)" : value),
      color: sym.fill?.hex || "#999999",
      outline: sym.outline?.hex || null,
      visible: xmlAttr(tag, "render") !== "false",
    });
  }
  const opacityMatch = text.match(/<layerOpacity>\s*([\d.]+)\s*<\/layerOpacity>/);
  const opacity = opacityMatch ? Number(opacityMatch[1]) : 1;
  return { field, categories, opacity: Number.isFinite(opacity) ? opacity : 1 };
}

// ---------- categories ----------

// Distinct values of `field`, in first-seen order, each with a colour from `colorFor(value)`.
export function autoCategories(features, field, colorFor) {
  const seen = new Map();
  features.forEach((f) => {
    const v = f.attributes?.[field];
    const key = v == null || v === "" ? null : String(v);
    if (!seen.has(key)) seen.set(key, 0);
    seen.set(key, seen.get(key) + 1);
  });
  return Array.from(seen.entries()).map(([value, count]) => ({
    value, label: value == null ? "(no value)" : value, color: colorFor(value), outline: null, visible: true, count,
  }));
}

// Applies a parsed .qml onto a layer's categories: every value the style knows takes the style's colour/
// label/visibility; values present in the data but absent from the style keep their auto colour (a
// style saved before a new unit was mapped shouldn't make that unit vanish). Values only in the style
// are dropped — they'd be legend rows with nothing on the map. QML matches on the STORED value, which is
// why "Epiclastics" (value) keeps its long label "mafic-intermediate epiclastics (...)".
export function applyQmlToCategories(categories, qml) {
  if (!qml) return categories;
  const byValue = new Map(qml.categories.map((c) => [c.value == null ? null : String(c.value), c]));
  return categories.map((c) => {
    const s = byValue.get(c.value);
    return s ? { ...c, color: s.color, outline: s.outline, label: s.label || c.label, visible: s.visible } : c;
  });
}

// Picks the attribute most likely to be the unit/lithology column when no style says which.
export function guessStyleField(fields) {
  const prefs = [/^lith/i, /^unit/i, /^geol/i, /^rock/i, /^formation/i, /^map_?unit/i, /^code/i, /^name$/i, /^type$/i];
  for (const re of prefs) { const f = fields.find((x) => re.test(x)); if (f) return f; }
  return fields[0] || null;
}

// ---------- normalizing an imported vector layer ----------

// `layer`: parser output { name, features: [{ geometry, parts, attributes }], geomType, epsg }.
// `transform(x, y)` -> [x, y] reprojects into the project CRS (identity when the CRS already matches).
// Coordinates are stored rounded to 1 cm (same precision decision as store.jsx's generatedSurfaces) —
// hand-digitized map vertices carry 17 significant digits of noise otherwise.
export function normalizeMapLayer(layer, transform = (x, y) => [x, y]) {
  const r2 = (v) => Math.round(v * 100) / 100;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  const features = [];
  (layer.features || []).forEach((f) => {
    const srcParts = f.parts && f.parts.length ? f.parts : [f.geometry || []];
    const parts = srcParts.map((part) => part.map(([x, y]) => {
      const [tx, ty] = transform(x, y);
      if (tx < xmin) xmin = tx; if (tx > xmax) xmax = tx;
      if (ty < ymin) ymin = ty; if (ty > ymax) ymax = ty;
      return [r2(tx), r2(ty)];
    })).filter((p) => p.length);
    if (!parts.length) return;
    features.push({ parts, attributes: f.attributes || {} });
  });
  const fields = Array.from(features.reduce((s, f) => { Object.keys(f.attributes).forEach((k) => s.add(k)); return s; }, new Set()));
  return {
    name: layer.name,
    geomType: layer.geomType || "polygon",
    features,
    fields,
    bbox: features.length ? [xmin, ymin, xmax, ymax] : null,
  };
}

export function featureCategoryValue(feature, field) {
  const v = feature.attributes?.[field];
  return v == null || v === "" ? null : String(v);
}

// ---------- rasterize for draping ----------

// Texture size for a layer: ~targetMetresPerPixel, longest side capped at maxSize (GPU texture budget —
// a 4096 texture is ~64 MB with mipmaps, so a small/modest-hardware cap of 4096 is used by default) and
// floored at 512 so a tiny outcrop map isn't blurry.
export function mapTextureSize(bbox, { targetMetresPerPixel = 1, maxSize = 4096 } = {}) {
  const w = Math.max(1e-6, bbox[2] - bbox[0]), h = Math.max(1e-6, bbox[3] - bbox[1]);
  const long = Math.max(w, h);
  const longPx = Math.round(Math.min(maxSize, Math.max(512, long / targetMetresPerPixel)));
  const scale = longPx / long;
  return { width: Math.max(2, Math.round(w * scale)), height: Math.max(2, Math.round(h * scale)), metresPerPixel: 1 / scale };
}

// Draws the layer into a 2D canvas context covering `bbox` (north up). Polygons fill with the even-odd
// rule (every ring of a feature in one path, so holes and multipart units are right) and get a thin
// outline; lines stroke; points dot. Hidden categories are skipped. Returns the number of features drawn.
export function drawMapLayer(ctx, layer, bbox, width, height) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const sx = width / (xmax - xmin), sy = height / (ymax - ymin);
  const px = (x) => (x - xmin) * sx;
  const py = (y) => (ymax - y) * sy;
  const catByValue = new Map((layer.categories || []).map((c) => [c.value, c]));
  const fallback = { color: layer.color || "#e2a63c", outline: null, visible: true };
  const outlineOn = layer.showOutlines !== false;
  const lineWidth = Math.max(1, Math.min(4, (layer.lineWidthM || 2) * Math.min(sx, sy)));
  ctx.clearRect(0, 0, width, height);
  let drawn = 0;
  const pass = (kind) => layer.features.forEach((f) => {
    const cat = layer.styleField ? (catByValue.get(featureCategoryValue(f, layer.styleField)) || fallback) : fallback;
    if (cat.visible === false) return;
    if (layer.geomType === "polygon") {
      ctx.beginPath();
      f.parts.forEach((ring) => {
        ring.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
        ctx.closePath();
      });
      if (kind === "fill") { ctx.fillStyle = cat.color; ctx.fill("evenodd"); drawn++; }
      else if (outlineOn) { ctx.strokeStyle = cat.outline || "#232323"; ctx.lineWidth = 1; ctx.stroke(); }
    } else if (layer.geomType === "polyline") {
      if (kind !== "fill") return;
      ctx.strokeStyle = cat.color; ctx.lineWidth = lineWidth; ctx.lineJoin = "round"; ctx.lineCap = "round";
      f.parts.forEach((line) => {
        ctx.beginPath();
        line.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
        ctx.stroke();
      });
      drawn++;
    } else {
      if (kind !== "fill") return;
      ctx.fillStyle = cat.color;
      const r = Math.max(2, lineWidth * 1.5);
      f.parts.forEach((part) => part.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(px(x), py(y), r, 0, Math.PI * 2); ctx.fill(); }));
      drawn++;
    }
  });
  pass("fill");
  if (layer.geomType === "polygon") pass("outline"); // outlines after ALL fills, so a neighbour's fill never covers a shared edge
  return drawn;
}

// A signature of everything that changes the rasterized image (not opacity/visibility/drape, which are
// material/mesh properties) — lets the renderer skip re-rasterizing on unrelated edits.
export function mapStyleSignature(layer) {
  return JSON.stringify([layer.styleField, layer.showOutlines, layer.color, layer.lineWidthM, (layer.categories || []).map((c) => [c.value, c.color, c.outline, c.visible])]);
}

// ---------- contacts between mapped units ----------

// Extracts the lines along which two DIFFERENT units touch — the mapped geological contacts — from a
// polygon layer.
//
// WHY PROXIMITY, NOT SHARED EDGES. The first version matched identical edges (same two vertices in two
// polygons), which only works on a vertex-topological map. Measured on Matt's real Orion geology map,
// 97.8% of polygon edges had no identical partner: QGIS snapping had put neighbouring boundaries onto
// each other's SEGMENTS (641 of 1,454 sampled vertices within 0.5 m of a neighbour, only 216 exactly
// coincident), not onto shared vertices. So each boundary is sampled every `spacing` metres and each
// sample asks "which OTHER unit's boundary is within `tolerance` of me?". The same map also draws dykes
// as polygons lying on top of their host (48 sampled vertices strictly inside another unit's polygon);
// a sample inside a different unit's polygon is therefore a contact with that unit too.
//
// Each shared boundary is seen from both sides, so a boundary sample is kept only from the side whose
// unit name sorts first; an overlap sample is always kept (the host polygon's own boundary never comes
// near the dyke, so the dyke's side is the only one that sees it). Samples near no other unit — the
// outer limit of mapping — are not contacts: projecting the edge of the mapped area underground would
// invent a boundary that isn't geology.
//
// Returns { contacts: [{ key, units: [a, b], lines: [[[x,y], ...], ...], lengthM }], diagnostics }.
export function extractMapContacts(layer, field, { tolerance = 2, spacing = 5 } = {}) {
  const feats = layer.features.map((f) => ({ unit: featureCategoryValue(f, field), parts: f.parts, bbox: ringsBbox(f.parts) }));
  // Uniform grid over all segments for nearest-boundary queries.
  const cell = Math.max(tolerance * 4, 25);
  const grid = new Map();
  const gkey = (i, j) => `${i},${j}`;
  feats.forEach((f, fi) => f.parts.forEach((ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const i0 = Math.floor((Math.min(a[0], b[0]) - tolerance) / cell), i1 = Math.floor((Math.max(a[0], b[0]) + tolerance) / cell);
      const j0 = Math.floor((Math.min(a[1], b[1]) - tolerance) / cell), j1 = Math.floor((Math.max(a[1], b[1]) + tolerance) / cell);
      for (let gi = i0; gi <= i1; gi++) for (let gj = j0; gj <= j1; gj++) {
        const k = gkey(gi, gj);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push([fi, a, b]);
      }
    }
  }));
  const neighbourUnit = (p, fi) => {
    const own = feats[fi].unit;
    let best = null, bestD = tolerance;
    for (const [gj, a, b] of grid.get(gkey(Math.floor(p[0] / cell), Math.floor(p[1] / cell))) || []) {
      if (gj === fi || feats[gj].unit === own) continue;
      const d = pointSegDist(p, a, b);
      if (d <= bestD) { bestD = d; best = feats[gj].unit; }
    }
    if (best !== null || bestD < tolerance) return { unit: best, overlap: false };
    for (let gj = 0; gj < feats.length; gj++) {
      const g = feats[gj];
      if (gj === fi || g.unit === own || !g.bbox || p[0] < g.bbox[0] || p[0] > g.bbox[2] || p[1] < g.bbox[1] || p[1] > g.bbox[3]) continue;
      if (pointInRings(p, g.parts)) return { unit: g.unit, overlap: true };
    }
    return null;
  };

  const byPair = new Map();
  let samples = 0, contactSamples = 0, overlapSamples = 0;
  const pushRun = (units, run) => {
    if (run.length < 2) return;
    const pair = units.slice().sort((x, y) => String(x).localeCompare(String(y)));
    const key = `${pair[0]}|${pair[1]}`;
    if (!byPair.has(key)) byPair.set(key, { units: pair, lines: [] });
    byPair.get(key).lines.push(run);
  };
  feats.forEach((f, fi) => f.parts.forEach((ring) => {
    const pts = densifyLine(ring, spacing);
    let runUnit, run = [];
    const flush = () => { if (runUnit !== undefined) pushRun([f.unit, runUnit], run); run = []; runUnit = undefined; };
    pts.forEach((p) => {
      samples++;
      const nb = neighbourUnit(p, fi);
      const keep = nb && nb.unit !== f.unit && (nb.overlap || String(f.unit) < String(nb.unit));
      if (nb && nb.overlap) overlapSamples++;
      if (!keep) { flush(); return; }
      contactSamples++;
      if (runUnit !== nb.unit) { const last = run[run.length - 1]; flush(); if (last) run.push(last); runUnit = nb.unit; }
      run.push(p);
    });
    flush();
  }));

  const contacts = [];
  byPair.forEach(({ units, lines }, key) => {
    const lengthM = lines.reduce((s, l) => s + lineLength(l), 0);
    contacts.push({ key, units, lines, lengthM });
  });
  contacts.sort((a, b) => b.lengthM - a.lengthM);
  return { contacts, diagnostics: { samples, contactSamples, overlapSamples } };
}

function ringsBbox(parts) {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  parts.forEach((r) => r.forEach(([x, y]) => { if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }));
  return Number.isFinite(xmin) ? [xmin, ymin, xmax, ymax] : null;
}
function pointSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
// Even-odd point-in-polygon over every ring (holes and multipart units handled by parity).
export function pointInRings(p, parts) {
  let inside = false;
  parts.forEach((r) => {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  });
  return inside;
}
export function lineLength(l) {
  let s = 0;
  for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
  return s;
}

// Resamples a polyline to points no more than `spacing` apart (keeps the original vertices).
export function densifyLine(line, spacing) {
  if (line.length < 2 || !(spacing > 0)) return line.slice();
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1], [x1, y1] = line[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / spacing));
    for (let s = 1; s <= n; s++) out.push([x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n]);
  }
  return out;
}

// Thins a polyline so consecutive kept points are at least `spacing` apart (for feeding a model a
// reasonable number of interface points from a densely digitized trace).
export function thinLine(line, spacing) {
  if (line.length < 2) return line.slice();
  const out = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (acc >= spacing) { out.push(line[i]); acc = 0; }
  }
  if (out[out.length - 1] !== line[line.length - 1]) out.push(line[line.length - 1]);
  return out;
}

// ---------- surface structural measurements ----------

const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Guesses which CSV columns hold what. Order matters: "dip direction" must be claimed before "dip", and
// "Structure Type" (exact) before "Symbology Structure Type" (the sample file has both).
export function guessStructureColumns(headers) {
  const hs = headers.map((h) => ({ h, n: norm(h) }));
  const take = (tests, exclude = []) => {
    for (const t of tests) {
      const hit = hs.find(({ h, n }) => !exclude.includes(h) && t(n));
      if (hit) return hit.h;
    }
    return null;
  };
  const dipDir = take([(n) => n === "dipdirection" || n === "dipdir" || n === "ddir" || n === "dipazimuth" || n === "dipaz", (n) => n.startsWith("dipdir"), (n) => n === "azimuth" || n === "az"]);
  const dip = take([(n) => n === "dip", (n) => n.startsWith("dip") && !n.startsWith("dipdir") && !n.startsWith("dipaz")], [dipDir]);
  const x = take([(n) => n === "x" || n === "easting" || n === "east", (n) => n.startsWith("easting") || n.startsWith("east"), (n) => n.includes("easting")]);
  const y = take([(n) => n === "y" || n === "northing" || n === "north", (n) => n.startsWith("northing") || n.startsWith("north"), (n) => n.includes("northing")]);
  const z = take([(n) => n === "z" || n === "elev" || n === "elevation" || n === "rl" || n === "alt" || n === "altitude", (n) => n.startsWith("elev")]);
  const strike = take([(n) => n === "strike" || n === "strk", (n) => n.startsWith("strike")]);
  const type = take([(n) => n === "structuretype" || n === "type" || n === "structure", (n) => n.endsWith("structuretype"), (n) => n.includes("type")]);
  const comment = take([(n) => n === "comments" || n === "comment" || n === "notes" || n === "description", (n) => n.startsWith("comment")]);
  return { x, y, z, strike, dip, dipDir, type, comment };
}

// Normalizes a structure type string to a short canonical class used for colouring and filtering.
export function structureClass(t) {
  const s = String(t || "").toLowerCase();
  if (/fault|shear/.test(s)) return "fault";
  if (/bed/.test(s)) return "bedding";
  if (/foli|schist/.test(s)) return "foliation";
  if (/cleav/.test(s)) return "cleavage";
  if (/contact|dyke|dike/.test(s)) return "contact";
  if (/vein/.test(s)) return "vein";
  if (/joint|fract/.test(s)) return "joint";
  return "other";
}

// CSV rows -> [{ x, y, z (null when blank), dip, dipDir, strike, type, cls, comment }]. Dip direction is
// taken as recorded when present; otherwise derived from strike with the right-hand rule (dip direction
// = strike + 90), the convention BC assessment reports use. Returns { rows, skipped, derivedFromStrike,
// rhrMismatches } — a mismatch is a row whose recorded strike and dip direction don't differ by 90°,
// reported (not corrected) because it usually means a left-hand-rule strike or a typo, and only the
// geologist knows which.
export function parseStructureRows(rawRows, cols) {
  const num = (v) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^\d.+-eE]/g, "")); return Number.isFinite(n) ? n : null; };
  const rows = [];
  let skipped = 0, derivedFromStrike = 0, rhrMismatches = 0;
  rawRows.forEach((r) => {
    const x = num(r[cols.x]), y = num(r[cols.y]), dip = num(r[cols.dip]);
    let dipDir = cols.dipDir ? num(r[cols.dipDir]) : null;
    const strike = cols.strike ? num(r[cols.strike]) : null;
    if (x == null || y == null || dip == null || dip < 0 || dip > 90) { skipped++; return; }
    if (dipDir == null) {
      if (strike == null) { skipped++; return; }
      dipDir = (strike + 90) % 360; derivedFromStrike++;
    } else if (strike != null) {
      const d = Math.abs((((dipDir - strike) % 360) + 360) % 360 - 90);
      if (d > 2 && d < 358) rhrMismatches++;
    }
    const type = cols.type ? String(r[cols.type] ?? "") : "";
    rows.push({ x, y, z: cols.z ? num(r[cols.z]) : null, dip, dipDir: ((dipDir % 360) + 360) % 360, strike, type, cls: structureClass(type), comment: cols.comment ? String(r[cols.comment] ?? "") : "" });
  });
  return { rows, skipped, derivedFromStrike, rhrMismatches };
}

// Upward-pointing unit pole (E, N, Up) of a plane with dip direction/dip.
export function upwardPole(dipDirDeg, dipDeg) {
  const dd = (dipDirDeg * Math.PI) / 180, dp = (dipDeg * Math.PI) / 180;
  return [Math.sin(dd) * Math.sin(dp), Math.cos(dd) * Math.sin(dp), Math.cos(dp)];
}
export function dipFromUpwardPole([e, n, u]) {
  const len = Math.hypot(e, n, u) || 1;
  const up = u / len;
  const dip = (Math.acos(Math.max(-1, Math.min(1, Math.abs(up)))) * 180) / Math.PI;
  const s = up < 0 ? -1 : 1;
  let dipDir = (Math.atan2(s * e, s * n) * 180) / Math.PI;
  if (dipDir < 0) dipDir += 360;
  return { dip, dipDir };
}

// Local orientation at (x, y) from nearby measurements: inverse-distance-squared mean of upward poles
// within `radius` (sign-aligned so a 88° east and an 88° west dip average to vertical, not to flat).
// Returns { dip, dipDir, count, nearestM } or null when nothing is in range.
export function orientationAt(x, y, measurements, radius) {
  let se = 0, sn = 0, su = 0, count = 0, nearest = Infinity;
  measurements.forEach((m) => {
    const d = Math.hypot(m.x - x, m.y - y);
    if (d > radius) return;
    nearest = Math.min(nearest, d);
    const w = 1 / Math.max(1, d) ** 2;
    const p = upwardPole(m.dipDir, m.dip);
    // Align sub-vertical poles to a common horizontal sense before summing.
    const ref = count ? [se, sn, su] : p;
    const sign = p[0] * ref[0] + p[1] * ref[1] + p[2] * ref[2] < 0 ? -1 : 1;
    se += sign * p[0] * w; sn += sign * p[1] * w; su += sign * p[2] * w;
    count++;
  });
  if (!count) return null;
  return { ...dipFromUpwardPole([se, sn, su]), count, nearestM: nearest };
}

// ---------- projecting a contact underground ----------

// Sweeps a draped contact trace down-dip into a ribbon surface. `line3d`: [[x, y, z], ...] on the ground.
// `orient(x, y)` -> { dip, dipDir } per vertex (lets the dip vary along strike with the nearest
// measurements). Rows are placed at equal VERTICAL depth steps below each trace vertex, displaced
// horizontally down-dip by depth / tan(dip) — so `depth` means "this far below the outcrop", which is
// how a geologist states a projection, not an along-dip length that explodes for shallow dips. Dips are
// clamped to [minDip, 90]; a sub-horizontal contact projected this way would run off the map sideways,
// which is a job for the implicit model, not a dip projection.
// Returns { vertices: [x,y,z,...] (world), indices: [...], clampedDips }.
export function projectContactRibbon(line3d, orient, { depth = 300, rows = 12, minDip = 10 } = {}) {
  const n = line3d.length;
  const vertices = [];
  const indices = [];
  let clampedDips = 0;
  if (n < 2) return { vertices, indices, clampedDips };
  line3d.forEach(([x, y, z]) => {
    const o = orient(x, y) || { dip: 90, dipDir: 0 };
    let dip = o.dip;
    if (dip < minDip) { dip = minDip; clampedDips++; }
    const dd = (o.dipDir * Math.PI) / 180;
    const horizPerM = dip >= 89.999 ? 0 : 1 / Math.tan((dip * Math.PI) / 180);
    for (let r = 0; r <= rows; r++) {
      const d = (depth * r) / rows;
      vertices.push(x + Math.sin(dd) * horizPerM * d, y + Math.cos(dd) * horizPerM * d, z - d);
    }
  });
  const stride = rows + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let r = 0; r < rows; r++) {
      const a = i * stride + r, b = a + 1, c = a + stride, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { vertices, indices, clampedDips };
}

// Colour per structure class (#317) — the fault/bedding/foliation/contact/vein hues match
// layers.js's STRUCT_COLORS for the downhole equivalents, so a surface bedding pick and a core
// bedding pick read as the same kind of thing in one scene.
export const STRUCTURE_CLASS_COLORS = {
  fault: "#c0392b", bedding: "#4a7ab5", foliation: "#3a8a8a", cleavage: "#4aa06a",
  contact: "#8a6fae", vein: "#e8dfc4", joint: "#c9863d", other: "#8a8578",
};
export const STRUCTURE_CLASS_LABELS = {
  fault: "Fault / shear", bedding: "Bedding", foliation: "Foliation", cleavage: "Cleavage",
  contact: "Contact / dyke", vein: "Vein", joint: "Joint / fracture", other: "Other",
};
