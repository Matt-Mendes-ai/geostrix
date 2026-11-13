// TASKS.csv #3066 (Matt, 2026-11-12) — USGS structure symbols for outcrop structure measurements, drawn as vector shapes from the FGDC Digital
// Cartographic Standard for Geologic Map Symbolization (FGDC-STD-013-2006, Appendix A; public domain, read from the USGS National Geologic
// Map Database, not bundled). Each symbol cites its FGDC reference number. Pure: no DOM, no three.js; the renderers (the 3D view, the KMZ
// icons, the legend and the list's SVG) draw the same parts.
//
// The frame of a symbol, in millimetres at map scale (the standard's own sizes): u along the strike (the right-hand-rule strike direction),
// v toward the dip direction (strike + 90°), the point of observation at (0, 0) — "the midpoint of the strike line" for a single observation.
// parts: { t: "line", p: [[u, v], ...], dash?: [on, off] } | { t: "poly", p: [[u, v], ...], fill: bool } | { t: "circle", c: [u, v], r, fill }
// | { t: "arc", c: [u, v], r, a0, a1 } (angles in degrees from +u toward +v). label: where the dip (plunge) number is anchored, or null.
// All line weights 0.2 mm in the standard (lineMm); the strike line is 5.0 mm.

export const LINE_MM = 0.2;
const S = 2.5; // half the 5.0 mm strike line

const strike = (dash) => ({ t: "line", p: [[-S, 0], [S, 0]], ...(dash ? { dash } : {}) });
const tick = (len = 1.0) => ({ t: "line", p: [[0, 0], [0, len]] });
const cross = (half = 1.0) => ({ t: "line", p: [[0, -half], [0, half]] });
const ring = { t: "circle", c: [0, 0], r: 1.25, fill: false }; // the 2.5 mm circle of the horizontal symbols
const LABEL = [0.6, 1.9]; // the dip number: beyond the tick, on the dip side (HI-6 label in the standard)

// a filled arrowhead at v = tip (dir 1: pointing +v), 1.25 mm long, 25° each side (§9)
function arrowHead(tip, dir = 1) { const L = 1.25, h = L * Math.tan((25 * Math.PI) / 180); return { t: "poly", p: [[0, tip], [-h, tip - dir * L], [h, tip - dir * L]], fill: true }; }
// a triangle on the dip side with its apex `h` mm from the strike line and the given apex angle (degrees)
const tri = (h, apexDeg, fill, side = 1) => { const half = h * Math.tan((apexDeg * Math.PI) / 360); return { t: "poly", p: [[-half, 0], [0, side * h], [half, 0]], fill }; };

// the symbols, one per FGDC reference used. kind: "planar" (strike and dip) | "linear" (trend and plunge); attitude: inclined | vertical | horizontal
export const SYMBOLS = {
  // 6 — Bedding
  "6.2": { fgdc: "6.2", name: "Inclined bedding", kind: "planar", attitude: "inclined", parts: [strike(), tick()], label: LABEL },
  "6.3": { fgdc: "6.3", name: "Vertical bedding", kind: "planar", attitude: "vertical", parts: [strike(), cross()], label: null },
  "6.1": { fgdc: "6.1", name: "Horizontal bedding", kind: "planar", attitude: "horizontal", parts: [ring, { t: "line", p: [[-1.25, 0], [1.25, 0]] }, { t: "line", p: [[0, -1.25], [0, 1.25]] }], label: null },
  // overturned: the tick bends back into a hook of 0.625 mm radius
  "6.4": { fgdc: "6.4", name: "Overturned bedding", kind: "planar", attitude: "inclined", parts: [strike(), { t: "line", p: [[0, 0], [0, 0.4]] }, { t: "arc", c: [0.625, 0.4], r: 0.625, a0: 180, a1: 0 }], label: LABEL },
  // approximate orientation: a dashed strike line
  "6.33": { fgdc: "6.33", name: "Approximate orientation of inclined bedding", kind: "planar", attitude: "inclined", parts: [strike([2.0, 0.7]), tick()], label: LABEL },
  "6.34": { fgdc: "6.34", name: "Approximate orientation of vertical bedding", kind: "planar", attitude: "vertical", parts: [strike([2.0, 0.7]), cross()], label: null },
  // 4.3 — Small, minor joints (1st option): a filled box on the strike line
  "4.3.2": { fgdc: "4.3.2", name: "Small, minor inclined joint", kind: "planar", attitude: "inclined", parts: [strike(), { t: "poly", p: [[-0.5625, 0], [-0.5625, 0.5625], [0.5625, 0.5625], [0.5625, 0]], fill: true }], label: LABEL },
  "4.3.3": { fgdc: "4.3.3", name: "Small, minor vertical joint", kind: "planar", attitude: "vertical", parts: [strike(), { t: "poly", p: [[-0.5625, -0.5625], [-0.5625, 0.5625], [0.5625, 0.5625], [0.5625, -0.5625]], fill: true }], label: null },
  "4.3.1": { fgdc: "4.3.1", name: "Small, minor horizontal joint", kind: "planar", attitude: "horizontal", parts: [ring, { t: "poly", p: [[-0.5625, -0.5625], [-0.5625, 0.5625], [0.5625, 0.5625], [0.5625, -0.5625]], fill: true }], label: null },
  // 7 — Cleavage (generic or type unspecified): ticks at both ends of the strike line
  "7.2": { fgdc: "7.2", name: "Inclined cleavage", kind: "planar", attitude: "inclined", parts: [strike(), { t: "line", p: [[-S, 0], [-S, 1.0]] }, { t: "line", p: [[S, 0], [S, 1.0]] }], label: LABEL },
  "7.3": { fgdc: "7.3", name: "Vertical cleavage", kind: "planar", attitude: "vertical", parts: [strike(), { t: "line", p: [[-S, -0.75], [-S, 0.75]] }, { t: "line", p: [[S, -0.75], [S, 0.75]] }], label: null },
  "7.1": { fgdc: "7.1", name: "Horizontal cleavage", kind: "planar", attitude: "horizontal", parts: [{ t: "line", p: [[-2, 0], [2, 0]] }, { t: "line", p: [[0, -2], [0, 2]] }, { t: "line", p: [[-2, -0.5], [-2, 0.5]] }, { t: "line", p: [[2, -0.5], [2, 0.5]] }, { t: "line", p: [[-0.5, -2], [0.5, -2]] }, { t: "line", p: [[-0.5, 2], [0.5, 2]] }], label: null },
  // 8.1 — Generic foliation (origin not known or not specified): an open triangle, 90° apex, 1.0 mm high
  "8.1.2": { fgdc: "8.1.2", name: "Inclined generic foliation", kind: "planar", attitude: "inclined", parts: [strike(), tri(1.0, 90, false)], label: LABEL },
  "8.1.3": { fgdc: "8.1.3", name: "Vertical generic foliation", kind: "planar", attitude: "vertical", parts: [strike(), tri(1.0, 90, false), tri(1.0, 90, false, -1)], label: null },
  "8.1.1": { fgdc: "8.1.1", name: "Horizontal generic foliation", kind: "planar", attitude: "horizontal", parts: [ring, { t: "poly", p: [[-0.75, 0], [0, 0.75], [0.75, 0], [0, -0.75]], fill: false }], label: null },
  // 8.3 — Metamorphic or tectonic foliation: a filled triangle, 60° apex, 1.0 mm high
  "8.3.2": { fgdc: "8.3.2", name: "Inclined metamorphic or tectonic foliation", kind: "planar", attitude: "inclined", parts: [strike(), tri(1.0, 60, true)], label: LABEL },
  "8.3.3": { fgdc: "8.3.3", name: "Vertical metamorphic or tectonic foliation", kind: "planar", attitude: "vertical", parts: [strike(), tri(1.0, 60, true), tri(1.0, 60, true, -1)], label: null },
  "8.3.1": { fgdc: "8.3.1", name: "Horizontal metamorphic or tectonic foliation", kind: "planar", attitude: "horizontal", parts: [ring, { t: "poly", p: [[-0.55, 0], [0, 0.95], [0.55, 0], [0, -0.95]], fill: true }], label: null },
  // 2.15 — Small, minor faults (the standard's point symbols for a fault seen in outcrop): a 10.0 mm strike line at the fault weight (.375 mm)
  "2.15.1": { fgdc: "2.15.1", name: "Small, minor inclined fault", kind: "planar", attitude: "inclined", parts: [{ t: "line", p: [[-5, 0], [5, 0]], w: 0.375 }, { t: "line", p: [[0, 0], [0, 1.425]] }], label: [0.7, 2.3] },
  "2.15.2": { fgdc: "2.15.2", name: "Small, minor vertical fault", kind: "planar", attitude: "vertical", parts: [{ t: "line", p: [[-5, 0], [5, 0]], w: 0.375 }, { t: "line", p: [[0, -1.25], [0, 1.25]] }], label: null },
  // 1.4 — attitude of a contact (the contact line, .15 mm, with the dip tick 1.75 mm) placed where the observation was made
  "1.4.1": { fgdc: "1.4.1", name: "Inclined contact", kind: "planar", attitude: "inclined", parts: [{ t: "line", p: [[-S, 0], [S, 0]], w: 0.15 }, { t: "line", p: [[0, 0], [0, 1.75]], w: 0.15 }], label: [0.6, 2.6] },
  "1.4.3": { fgdc: "1.4.3", name: "Vertical contact", kind: "planar", attitude: "vertical", parts: [{ t: "line", p: [[-S, 0], [S, 0]], w: 0.15 }, { t: "line", p: [[0, -1.25], [0, 1.25]], w: 0.15 }], label: null },
  // 1.3 + 1.4 — a dike (or vein: the standard has no vein symbol in sections 1, 2 and 9) as a short dike line (.25 mm) with the contact
  // attitude decorations, which §1.4 applies to dikes
  "1.3+1.4.1": { fgdc: "1.3 / 1.4.1", name: "Inclined dike or vein (dike line, contact dip tick)", kind: "planar", attitude: "inclined", parts: [{ t: "line", p: [[-S, 0], [S, 0]], w: 0.25 }, { t: "line", p: [[0, 0], [0, 1.75]], w: 0.25 }], label: [0.6, 2.6] },
  "1.3+1.4.3": { fgdc: "1.3 / 1.4.3", name: "Vertical dike or vein (dike line, contact crossbar)", kind: "planar", attitude: "vertical", parts: [{ t: "line", p: [[-S, 0], [S, 0]], w: 0.25 }, { t: "line", p: [[0, -1.25], [0, 1.25]], w: 0.25 }], label: null },
  // 9 — Lineation (trend and plunge: the reading's dip direction and dip): a 6.0 mm arrow from the point, a filled head 1.25 mm at 25°
  "9.3": { fgdc: "9.3", name: "Inclined lineation", kind: "linear", attitude: "inclined", parts: [{ t: "line", p: [[0, 0], [0, 6]] }, arrowHead(6)], label: [0, 7.1] },
  "9.5": { fgdc: "9.5", name: "Horizontal lineation", kind: "linear", attitude: "horizontal", parts: [{ t: "line", p: [[0, -3], [0, 3]] }, arrowHead(3), arrowHead(-3, -1)], label: null },
  "9.7": { fgdc: "9.7", name: "Vertical lineation", kind: "linear", attitude: "vertical", parts: [{ t: "line", p: [[-1.6, -1.6], [1.6, 1.6]] }, { t: "line", p: [[-1.6, 1.6], [1.6, -1.6]] }, { t: "poly", p: [[0, 0.975], [0.3, 0], [0, -0.975], [-0.3, 0]], fill: true }, { t: "poly", p: [[0.975, 0], [0, 0.3], [-0.975, 0], [0, -0.3]], fill: true }], label: null },
  // 9.97 — Generic small, minor fold hinge: the lineation arrow with a .5 mm dot about 2.75 mm back from the tip
  "9.97": { fgdc: "9.97", name: "Minor fold hinge", kind: "linear", attitude: "inclined", parts: [{ t: "line", p: [[0, 0], [0, 6]] }, arrowHead(6), { t: "circle", c: [0, 3.25], r: 0.25, fill: true }], label: [0, 7.1] },
  "9.99": { fgdc: "9.99", name: "Horizontal minor fold hinge", kind: "linear", attitude: "horizontal", parts: [{ t: "line", p: [[0, -3], [0, 3]] }, arrowHead(3), arrowHead(-3, -1), { t: "circle", c: [0, 0], r: 0.25, fill: true }], label: null },
};

// The families a structure type can be given: one symbol each for an inclined, a vertical and a horizontal reading. The per-type choice is a
// family id; each reading then takes the variant its own dip asks for (a dip of 0 the horizontal symbol, 90 the vertical one).
export const FAMILIES = {
  bedding: { label: "Bedding", inclined: "6.2", vertical: "6.3", horizontal: "6.1" },
  beddingOverturned: { label: "Overturned bedding", inclined: "6.4", vertical: "6.3", horizontal: "6.1" },
  beddingApprox: { label: "Bedding, approximate orientation", inclined: "6.33", vertical: "6.34", horizontal: "6.1" },
  joint: { label: "Joint", inclined: "4.3.2", vertical: "4.3.3", horizontal: "4.3.1" },
  cleavage: { label: "Cleavage", inclined: "7.2", vertical: "7.3", horizontal: "7.1" },
  foliation: { label: "Foliation (origin not specified)", inclined: "8.1.2", vertical: "8.1.3", horizontal: "8.1.1" },
  foliationTectonic: { label: "Metamorphic or tectonic foliation", inclined: "8.3.2", vertical: "8.3.3", horizontal: "8.3.1" },
  // no horizontal point symbol for a fault, a contact or a dike in the standard: a reading of dip 0 keeps the inclined one with its 0
  fault: { label: "Fault (small, minor)", inclined: "2.15.1", vertical: "2.15.2", horizontal: "2.15.1" },
  contact: { label: "Contact", inclined: "1.4.1", vertical: "1.4.3", horizontal: "1.4.1" },
  vein: { label: "Vein or dike", inclined: "1.3+1.4.1", vertical: "1.3+1.4.3", horizontal: "1.3+1.4.1" },
  lineation: { label: "Lineation", inclined: "9.3", vertical: "9.7", horizontal: "9.5" },
  foldHinge: { label: "Minor fold hinge", inclined: "9.97", vertical: "9.7", horizontal: "9.99" },
};

// a dip (degrees) -> the attitude whose symbol it takes: horizontal at 0 (and a reading flagged horizontal, #2958), vertical from 89°
export const VERTICAL_FROM = 89;
export function attitudeOf(dip, horizontal = false) {
  const d = Math.abs(Number(dip));
  if (horizontal || d === 0) return "horizontal";
  return d >= VERTICAL_FROM ? "vertical" : "inclined";
}

// The default family of a structure type, read from its own words (any deposit style: no fixed list of types, #3066) and the class the
// importer gave it (mapLayers.structureClass). Words first ('overturned bedding', 'S1 schistosity', 'slaty cleavage'), then the class.
export function defaultFamily(typeText, cls) {
  const s = String(typeText || "").toLowerCase();
  if (/overturn|\bot\b|o\/t/.test(s)) return "beddingOverturned";
  if (/approx|estimat|~/.test(s) && /bed|s0|ss\b/.test(s)) return "beddingApprox";
  if (/fold ?ax|hinge|\bf[1-4]\b/.test(s)) return "foldHinge";
  if (/lineat|linear|stretch|slick|\bl[0-4]\b|mineral lin/.test(s)) return "lineation";
  if (/schist|gneiss|mylon|tecton|metamorph|\bs[123]\b/.test(s)) return "foliationTectonic";
  const byClass = { bedding: "bedding", joint: "joint", cleavage: "cleavage", foliation: "foliation", fault: "fault", contact: "contact", vein: "vein" };
  if (byClass[cls]) return byClass[cls];
  if (/bed|s0\b|lamin/.test(s)) return "bedding";
  if (/joint|fract/.test(s)) return "joint";
  if (/cleav/.test(s)) return "cleavage";
  if (/foli/.test(s)) return "foliation";
  if (/fault|shear/.test(s)) return "fault";
  if (/vein|dyke|dike/.test(s)) return "vein";
  if (/contact/.test(s)) return "contact";
  return FALLBACK_FAMILY;
}
// a type no FGDC family is chosen for: drawn as the plain strike-and-dip symbol (6.2's shape), said as such
export const FALLBACK_FAMILY = "bedding";

// the key a per-type choice is kept under: the type as written, trimmed, case-folded (as #2266's class choices)
export const typeKey = (t) => String(t ?? "").trim().toUpperCase();

// TASKS.csv #3066 — the per-type choice, saved with the project on each outcrop set (set.symbolByType: { TYPEKEY: familyId }); one map for
// the whole project, merged over the sets (a later set's choice wins for a type in both). #3067 (drillhole structure discs) reads the same.
export function projectSymbolChoices(surfaceStructures) {
  const out = {};
  for (const set of surfaceStructures || []) for (const [k, v] of Object.entries(set?.symbolByType || {})) if (FAMILIES[v]) out[k] = v;
  return out;
}

// the family of a reading's type: the project's choice, else the default from its words and class
export function familyFor(typeText, cls, choices = null) {
  const c = choices?.[typeKey(typeText)];
  return c && FAMILIES[c] ? c : defaultFamily(typeText, cls);
}

// a reading -> its symbol: { symbol, family, attitude }
export function symbolForReading(row, choices = null) {
  const family = familyFor(row?.type || row?.cls, row?.cls, choices), attitude = attitudeOf(row?.dip, !!row?.horizontal);
  return { symbol: SYMBOLS[FAMILIES[family][attitude]], family, attitude };
}

// The symbol placed: (u, v) mm -> map (east, north) mm offsets, for a reading's dip direction (degrees from grid north). u runs along the
// right-hand-rule strike (dip direction - 90°), v down dip. -> (u, v) => [e, n]
export function symbolFrame(dipDirDeg) {
  const dd = (Number(dipDirDeg) * Math.PI) / 180, st = dd - Math.PI / 2;
  const su = [Math.sin(st), Math.cos(st)], sv = [Math.sin(dd), Math.cos(dd)];
  return (u, v) => [u * su[0] + v * sv[0], u * su[1] + v * sv[1]];
}

// An SVG of a symbol (for the legend and the list): width / height in px, the symbol turned so its strike runs left to right (dip toward
// the bottom, as a map shows a 090° strike). Lines in `color`; fills too.
export function symbolSvg(symbol, { px = 22, color = "#222", rotateDeg = 0, label = null } = {}) {
  const k = px / 6.5, cx = px / 2, cy = px / 2;
  const rot = (rotateDeg * Math.PI) / 180, cr = Math.cos(rot), sr = Math.sin(rot);
  const P = ([u, v]) => { const x = u * cr - v * sr, y = u * sr + v * cr; return [(cx + x * k).toFixed(2), (cy + y * k).toFixed(2)]; };
  const swOf = (part) => Math.max(1, (part.w || LINE_MM) * k * 4).toFixed(2); // line weights: .2 mm, a fault's .375 mm
  const out = [];
  for (const part of symbol.parts) {
    if (part.t === "line") out.push(`<polyline points="${part.p.map((q) => P(q).join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="${swOf(part)}"${part.dash ? ` stroke-dasharray="${part.dash.map((d) => (d * k).toFixed(2)).join(" ")}"` : ""}/>`);
    else if (part.t === "poly") out.push(`<polygon points="${part.p.map((q) => P(q).join(",")).join(" ")}" fill="${part.fill ? color : "none"}" stroke="${color}" stroke-width="${swOf(part)}"/>`);
    else if (part.t === "circle") { const [x, y] = P(part.c); out.push(`<circle cx="${x}" cy="${y}" r="${(part.r * k).toFixed(2)}" fill="${part.fill ? color : "none"}" stroke="${color}" stroke-width="${swOf(part)}"/>`); }
    else if (part.t === "arc") { const pts = arcPoints(part, 12).map((q) => P(q).join(",")).join(" "); out.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${swOf(part)}"/>`); }
  }
  if (label != null && symbol.label) { const [x, y] = P(symbol.label); out.push(`<text x="${x}" y="${y}" font-size="${(px * 0.32).toFixed(1)}" fill="${color}" dominant-baseline="middle">${label}</text>`); }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${out.join("")}</svg>`;
}

// an arc part as points
export function arcPoints(part, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = ((part.a0 + ((part.a1 - part.a0) * i) / n) * Math.PI) / 180; out.push([part.c[0] + part.r * Math.cos(a), part.c[1] + part.r * Math.sin(a)]); }
  return out;
}

// A symbol as line segments and filled triangles in its own (u, v) mm frame, for the 3D view and the PNG renderer:
// -> { segments: [[u1, v1, u2, v2], ...], triangles: [[u1, v1, u2, v2, u3, v3], ...] } (dashes cut into segments; circles as 24-gons)
export function symbolGeometry(symbol) {
  const segments = [], triangles = [];
  const addPolyline = (pts, dash) => {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      if (!dash) { segments.push([a[0], a[1], b[0], b[1]]); continue; }
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), [on, off] = dash;
      for (let s = 0; s < L; s += on + off) { const e = Math.min(L, s + on); segments.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L, a[0] + ((b[0] - a[0]) * e) / L, a[1] + ((b[1] - a[1]) * e) / L]); }
    }
  };
  for (const part of symbol.parts) {
    if (part.t === "line") addPolyline(part.p, part.dash);
    else if (part.t === "arc") addPolyline(arcPoints(part));
    else if (part.t === "circle") {
      const pts = Array.from({ length: 25 }, (_, i) => { const a = (i * 2 * Math.PI) / 24; return [part.c[0] + part.r * Math.cos(a), part.c[1] + part.r * Math.sin(a)]; });
      if (part.fill) for (let i = 0; i < 24; i++) triangles.push([part.c[0], part.c[1], ...pts[i], ...pts[i + 1]]); else addPolyline(pts);
    } else if (part.t === "poly") {
      const pts = [...part.p, part.p[0]];
      if (part.fill) for (let i = 1; i < part.p.length - 1; i++) triangles.push([...part.p[0], ...part.p[i], ...part.p[i + 1]]);
      addPolyline(pts);
    }
  }
  return { segments, triangles };
}
