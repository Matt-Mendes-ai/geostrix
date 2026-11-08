// TASKS.csv #2134 (review #2013, Layout) — 'Load from view' applied its frame test (#1633) to the holes only: a 1:25,000 frame with no
// hole, soil or IP line inside still listed 'Surface samples / soil' (49 soils 8 km away) and the proposed IP lines. The same top-down,
// true-scale frame now filters the surface samples and the map layers: a sample counts when it is inside the frame, a map feature when
// a vertex is inside, a segment crosses the frame, or (a polygon) the frame's centre is inside it. Pure: no DOM, no React.
import { utmGridReady, capturedSize, worldToVp } from "./layoutGeometry.js";
import { layerCategoryValue, pointInRings } from "./mapLayers.js";

// a frame's test in its own page px: { inside(E, N), segment(a, b), centre: [E, N] } — or null when the frame is not such a capture
export function frameTest(el) {
  if (!el || !utmGridReady(el)) return null;
  const { w, h } = capturedSize(el), hw = w / 2, hh = h / 2;
  const vp = (p) => worldToVp(el, p[0], p[1]);
  const insideVp = ([x, y]) => Math.abs(x) <= hw && Math.abs(y) <= hh;
  // Liang-Barsky: does the segment a-b (page px) touch the rectangle |x| <= hw, |y| <= hh
  const clip = (a, b) => {
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] + hw], [dx, hw - a[0]], [-dy, a[1] + hh], [dy, hh - a[1]]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return true;
  };
  return {
    inside: (E, N) => insideVp(vp([E, N])),
    segment: (a, b) => clip(vp(a), vp(b)),
    centre: [el.targetWorld.x, el.targetWorld.y],
  };
}

export function samplesInFrame(test, samples) {
  if (!test) return samples || [];
  return (samples || []).filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && test.inside(s.x, s.y));
}

function featureInFrame(test, f, geomType) {
  const parts = f.parts || [];
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      if (test.inside(part[i][0], part[i][1])) return true;
      if (geomType !== "point" && i > 0 && test.segment(part[i - 1], part[i])) return true;
    }
    if (geomType === "polygon" && part.length > 2 && test.segment(part[part.length - 1], part[0])) return true;
  }
  return geomType === "polygon" && pointInRings(test.centre, parts); // a frame wholly inside one unit
}

// the map layers as the frame shows them: features outside it dropped, a layer with none left out, and the categories kept to the
// ones a kept feature is drawn in (a category's count becomes its count inside the frame)
export function mapLayersInFrame(test, mapLayers) {
  if (!test) return mapLayers || [];
  const out = [];
  for (const l of mapLayers || []) {
    if (l.visible === false) { out.push(l); continue; }
    const features = (l.features || []).filter((f) => featureInFrame(test, f, l.geomType));
    if (!features.length) continue;
    if (!l.styleField || !(l.categories || []).length) { out.push({ ...l, features }); continue; }
    const counts = new Map();
    for (const f of features) { const v = layerCategoryValue(l, f); counts.set(v, (counts.get(v) || 0) + 1); }
    const categories = l.categories.filter((c) => counts.has(c.value)).map((c) => ({ ...c, count: counts.get(c.value) }));
    out.push({ ...l, features, categories });
  }
  return out;
}
