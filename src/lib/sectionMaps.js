// TASKS.csv #4041 (Matt, v0.2.9, Macpass: "I want to have macrostrat geology on the cross section and on the overview map. Also other imported
// rasters or vectors") — the map layers on a cross-section. Pure: the main window builds the payload (lib/sectionMapsBuild.js, which samples
// the pictures), the section window draws it (components/SectionMapBands.jsx) and keys it. Along the section line, d is metres from A:
//   - a polygon layer (Macrostrat's units, an imported geology map): the units the line crosses, as spans [{ from, to, value, label, colour }]
//     from the polygons' crossings with the line, coloured as in Maps (its categories), drawn as a band along the ground;
//   - a line layer (faults, contacts): ticks [{ at, label, colour, dip }] where a line crosses the section;
//   - a raster (Macrostrat's drape, imagery, a classified or geophysics grid): its picture sampled along the line (at most STRIP_MAX samples, the
//     picture's own colours, its transparent colour skipped), as spans; a raster with a legend (Macrostrat's) names its units by colour.
// The overview pane draws the same layers under the section line, as small pictures made in the main window (one per layer, over the pane's
// extent). Which layers show is the section's own choice (labels.maps, saved with it), else the layers visible in Maps.
export const STRIP_MAX = 400, STRIP_MIN = 50, LEGEND_TOL = 24;

const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
const hex2 = (v) => v.toString(16).padStart(2, "0");
export const rgbHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// the section's line: A, its unit direction and length; P(d) = A + u d
export function lineOf(section) {
  const { ax, ay, bx, by } = section || {};
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;
  const len = Math.hypot(bx - ax, by - ay);
  if (!(len > 0)) return null;
  return { ax, ay, ux: (bx - ax) / len, uy: (by - ay) / len, len };
}
const at = (L, d) => [L.ax + L.ux * d, L.ay + L.uy * d];

// where the segment P(d0)..P(d1) crosses the segment p..q: -> d or null
function crossing(L, d0, d1, [px, py], [qx, qy]) {
  const [sx, sy] = at(L, d0), rx = L.ux * (d1 - d0), ry = L.uy * (d1 - d0), ex = qx - px, ey = qy - py;
  const den = rx * ey - ry * ex;
  if (Math.abs(den) < 1e-12) return null;
  const wx = px - sx, wy = py - sy, t = (wx * ey - wy * ex) / den, s = (wx * ry - wy * rx) / den;
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? d0 + t * (d1 - d0) : null;
}

const bboxCache = new WeakMap();
function featureBox(f) {
  let b = bboxCache.get(f);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const part of f.parts || []) for (const p of part || []) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }
    bboxCache.set(f, b);
  }
  return b;
}
const boxesMeet = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
function segBox(L, d0, d1) { const [x0, y0] = at(L, d0), [x1, y1] = at(L, d1); return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]; }
function inRings(x, y, parts) { // even-odd over every ring of the feature, as Maps fills it
  let inside = false;
  for (const ring of parts || []) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// a feature's look in Maps: its category (by the layer's style field), or the layer's one colour; null when its category is hidden
export function featureLook(layer, f) {
  if (!layer.styleField) return { value: null, label: layer.name || "", colour: isHex(layer.color) ? layer.color : "#e2a63c" };
  const v = f.attributes?.[layer.styleField], value = v == null || v === "" ? null : String(v);
  const cat = (layer.categories || []).find((c) => c.value === value);
  if (cat?.visible === false) return null;
  return { value, label: cat?.label ?? value ?? "", colour: isHex(cat?.color) ? cat.color : isHex(layer.color) ? layer.color : "#e2a63c" };
}

// a polygon layer's units along the line between d0 and d1 -> [{ from, to, value, label, colour }], in order, neighbours of one unit merged
export function polygonSpans(layer, section, [d0, d1]) {
  const L = lineOf(section);
  if (!L || layer?.geomType !== "polygon" || !(d1 > d0)) return [];
  const box = segBox(L, d0, d1), feats = (layer.features || []).filter((f) => boxesMeet(featureBox(f), box));
  const ds = [d0, d1];
  for (const f of feats) for (const ring of f.parts || []) for (let i = 0; i + 1 < ring.length; i++) { const d = crossing(L, d0, d1, ring[i], ring[i + 1]); if (d != null) ds.push(d); }
  for (const f of feats) for (const ring of f.parts || []) if (ring.length > 2) { const d = crossing(L, d0, d1, ring[ring.length - 1], ring[0]); if (d != null) ds.push(d); }
  ds.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < ds.length; i++) {
    const a = ds[i], b = ds[i + 1];
    if (b - a < 1e-3) continue;
    const [x, y] = at(L, (a + b) / 2);
    let look = null;
    for (const f of feats) { const fb = featureBox(f); if (x < fb[0] || x > fb[2] || y < fb[1] || y > fb[3] || !inRings(x, y, f.parts)) continue; const l = featureLook(layer, f); if (l) look = l; } // the last drawn is on top
    if (!look) continue;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.to - a) < 1e-3 && prev.value === look.value && prev.colour === look.colour) prev.to = b;
    else out.push({ from: a, to: b, value: look.value, label: look.label, colour: look.colour });
  }
  return out.map((s) => ({ ...s, from: Math.round(s.from * 10) / 10, to: Math.round(s.to * 10) / 10 }));
}

const DIP_KEYS = /^(dip|dip_?angle|dipangle)$/i;
// a line layer's crossings with the section between d0 and d1 -> [{ at, value, label, colour, dip }] in order (dip: the feature's own, if it has one)
export function lineTicks(layer, section, [d0, d1]) {
  const L = lineOf(section);
  if (!L || layer?.geomType !== "polyline" || !(d1 > d0)) return [];
  const box = segBox(L, d0, d1), out = [];
  for (const f of layer.features || []) {
    if (!boxesMeet(featureBox(f), box)) continue;
    const look = featureLook(layer, f);
    if (!look) continue;
    const k = Object.keys(f.attributes || {}).find((x) => DIP_KEYS.test(x)), dip = k != null && Number.isFinite(Number(f.attributes[k])) && f.attributes[k] !== "" ? Number(f.attributes[k]) : null;
    for (const line of f.parts || []) for (let i = 0; i + 1 < line.length; i++) {
      const d = crossing(L, d0, d1, line[i], line[i + 1]);
      if (d != null) out.push({ at: Math.round(d * 10) / 10, value: look.value, label: look.label, colour: look.colour, dip });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// a picture's colours along the line: px = { width, height, data } (RGBA) covering bbox north up; keyColour: its transparent colour (#rrggbb);
// legend: [{ name, color }] (Macrostrat's units) names a colour within LEGEND_TOL. -> spans [{ from, to, value, label, colour }]; a run of
// one colour is one span; samples off the picture or transparent are gaps
export function stripSpans(px, bbox, section, [d0, d1], { keyColour = null, legend = null, n = null } = {}) {
  const L = lineOf(section);
  if (!L || !px?.data || !(px.width > 0) || !(px.height > 0) || !bbox || !(d1 > d0)) return [];
  const [x0, y0, x1, y1] = bbox, pixM = Math.max((x1 - x0) / px.width, (y1 - y0) / px.height);
  const count = n || Math.max(STRIP_MIN, Math.min(STRIP_MAX, Math.ceil((d1 - d0) / (pixM || 1))));
  const step = (d1 - d0) / count, key = isHex(keyColour) ? rgbOf(keyColour) : null;
  const units = (legend || []).filter((u) => isHex(u?.color)).map((u) => ({ name: String(u.name ?? u.unit ?? ""), rgb: rgbOf(u.color), color: u.color.toLowerCase() }));
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = d0 + i * step, [x, y] = at(L, a + step / 2);
    const c = Math.floor(((x - x0) / (x1 - x0)) * px.width), r = Math.floor(((y1 - y) / (y1 - y0)) * px.height);
    let look = null;
    if (c >= 0 && r >= 0 && c < px.width && r < px.height) {
      const q = (r * px.width + c) * 4, R = px.data[q], G = px.data[q + 1], B = px.data[q + 2];
      if (px.data[q + 3] >= 128 && !(key && Math.abs(R - key[0]) + Math.abs(G - key[1]) + Math.abs(B - key[2]) <= 6)) {
        let best = null, bd = Infinity;
        for (const u of units) { const dd = Math.abs(R - u.rgb[0]) + Math.abs(G - u.rgb[1]) + Math.abs(B - u.rgb[2]); if (dd < bd) { bd = dd; best = u; } }
        look = best && bd <= LEGEND_TOL ? { value: best.name, label: best.name, colour: best.color } : { value: null, label: "", colour: rgbHex(R, G, B) };
      }
    }
    if (!look) continue;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.to - a) < 1e-6 && prev.value === look.value && (look.value != null || prev.colour === look.colour)) prev.to = a + step;
    else out.push({ from: a, to: a + step, ...look });
  }
  return out.map((s) => ({ ...s, from: Math.round(s.from * 10) / 10, to: Math.round(s.to * 10) / 10 }));
}

// the layers this section shows: its own choice (labels.maps, ids), else the ones visible in Maps
export function chosenMapIds(labels, maps) {
  const layers = maps?.layers || [];
  if (Array.isArray(labels?.maps)) { const ids = new Set(layers.map((l) => l.id)); return labels.maps.filter((id) => ids.has(id)); }
  return layers.filter((l) => l.visible).map((l) => l.id);
}
export const shownMapLayers = (maps, chosen) => { const s = new Set(chosen || []); return (maps?.layers || []).filter((l) => s.has(l.id)); };

// a credit's first sentence ("Geology: Macrostrat (macrostrat.org), CC BY 4.0") for the figure; the whole credit stays with the layer
export const shortCredit = (credit) => (credit ? String(credit).split(/\.\s/)[0].replace(/\.$/, "") : "");
export function creditsOf(layers) { return [...new Set((layers || []).map((l) => shortCredit(l.credit)).filter(Boolean))]; }

// the key's rows for the shown layers: "<layer>: <unit>" with its colour, each once (groupSectionLegend groups them under the layer's name)
export function mapKeyRows(maps, chosen, max = 30) {
  const out = [];
  for (const l of shownMapLayers(maps, chosen)) {
    const seen = new Set();
    for (const s of [...(l.spans || []), ...(l.ticks || [])]) {
      if (!s.label || seen.has(s.label) || seen.size >= max) continue;
      seen.add(s.label); out.push([`${l.name}: ${s.label}`, s.colour]);
    }
  }
  return out;
}

// the overview's model with the shown layers' pictures (drawn over the hillshade, under the plan) and their credits
export function overviewWithMaps(model, maps, chosen) {
  if (!model) return model;
  const shown = shownMapLayers(maps, chosen).filter((l) => l.png);
  if (!shown.length) return model;
  return { ...model, maps: shown.map((l) => ({ href: l.png, opacity: l.opacity ?? 0.8 })), credit: creditsOf(shownMapLayers(maps, chosen)).join(" · ") || null };
}

// the bands' place under the ground: the polygon and raster layers each a band of bh px, one under the other, the layer Maps draws on top
// nearest the ground (layers come in Maps' drawing order: rasters, then map layers); the line layers as ticks
export function bandLayers(layers) {
  const bands = [], ticks = [];
  for (const l of layers || []) { if (l.kind === "polyline") { if (l.ticks?.length) ticks.push(l); } else if (l.spans?.length) bands.push(l); }
  return { bands: bands.reverse(), ticks };
}
