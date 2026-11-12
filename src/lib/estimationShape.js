// TASKS.csv #2418 (review #2325, WA uranium) — a flat, thin, laterally extensive body (a palaeochannel, a coal or lignite seam, a
// laterite, a stratiform sulphide lens) needs a vertical cell far smaller than the horizontal one and a search flattened into the
// bedding. The engine takes both (cell3 = { dx, dy, dz }, a trend's ellipsoid); the dialog offered a cubic cell and a sphere.

// a horizontal search of `radius` across and `vertical` up and down, as a trend the engine takes (dip 0: the major and intermediate
// axes lie in the horizontal plane, the minor is vertical)
export function flatSearchTrend(radius, vertical, name = "flat search") {
  const r = Number(radius), v = Number(vertical);
  if (!(r > 0) || !(v > 0) || v >= r) return null;
  return { name, local: true, dip: 0, dipAzimuth: 0, pitch: 0, ratios: { max: r, int: r, min: v } };
}

// The data's case for a flat search, or null. traces: desurveyed holes [[{ x, y, z }]]; spans: each assayed hole's sampled length (m);
// spacingM: the typical distance from a drill site to the next; compositeM: the composite length. When nearly every hole is within
// a few degrees of vertical, the sampled span is under half the hole spacing, and the drilled depth is a small part of the drilling's
// width (WA uranium: 430 vertical holes 76 m apart, 27 m sampled each, ~80 m deep over ~10 km), the body is flat at the drilling's
// scale: a search of 2.5 x the spacing across and 1.5 composites up and down, on cells of a quarter of the spacing by one composite.
// Derived from these holes only, never from a deposit type; the dialog offers it, it is not applied by itself.
// TASKS.csv #3011 (WA iron review) — the sampled span no longer has to be under half the hole spacing: holes 22 m apart sampled over 50 m
// on a field 21 km wide (the flattest deposit reviewed) were never offered a flat search. Near-vertical holes and a drilled depth that is a
// small part of the drilling's width are the evidence; maxSpanShare stays as an option (Infinity by default) and the span is reported.
export function flatSearchProposal({ traces, spans, spacingM, compositeM, maxTiltDeg = 5, maxSpanShare = Infinity, maxDepthShare = 0.1 }) {
  const comp = Number(compositeM) > 0 ? Number(compositeM) : 2;
  if (!(spacingM > 0) || !traces?.length || !spans?.length) return null;
  let tested = 0, steep = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const t of traces) {
    if (!t?.length || t.length < 2) continue;
    const a = t[0], b = t[t.length - 1], dz = Math.abs(a.z - b.z), h = Math.hypot(a.x - b.x, a.y - b.y);
    if (!(dz > 0)) continue;
    tested++;
    if ((Math.atan2(h, dz) * 180) / Math.PI <= maxTiltDeg) steep++;
    for (const p of [a, b]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  }
  if (tested < 3 || steep / tested < 0.9) return null;
  if (z1 - z0 > maxDepthShare * Math.max(x1 - x0, y1 - y0)) return null; // the drilling is not much wider than it is deep
  const s = [...spans].filter((v) => v > 0).sort((p, q) => p - q);
  if (s.length < 3) return null;
  const span = s[s.length >> 1];
  if (span > maxSpanShare * spacingM) return null;
  const round = (v) => (v >= 20 ? Math.round(v / 5) * 5 : Math.max(1, Math.round(v)));
  return {
    vertical: steep / tested, holes: tested, spanM: span, spacingM, depthM: z1 - z0, widthM: Math.max(x1 - x0, y1 - y0), // depth / width: #3011
    radius: round(2.5 * spacingM), reachV: Math.max(2, round(1.5 * comp)), cell: round(spacingM / 4), cellHeight: comp,
  };
}
