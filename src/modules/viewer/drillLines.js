// TASKS.csv #2366 (review #2325, WA uranium) — section defaults from the drilling. Fence series opened at azimuth 0 / 50 m and By coordinates
// at azimuth 0 / 500 m on the bounding-box centre: on WA's fences bearing 110-130° that was 125 sections (94 empty) and a first section
// through 0 holes. Here: the dominant collar-to-nearest-collar bearing (the fences), the spacing between fences, the drilling's extent
// along them and the median collar; and a hook that seeds the fence-series and by-coordinates state with them until the user types.
import { useEffect, useMemo, useRef, useState } from "react";
import { median } from "../../lib/arrayStats.js";
import { t as tr } from "../../lib/i18n.js";

// collars [{ x, y }] -> { azimuth (0-180), spacing (m between fences), alongM (extent along them), centre: { x, y } } or null
export function drillLineGeometry(collars) {
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
  if (pts.length < 6) return null;
  // nearest-neighbour bearings, folded to 0-180 (a fence has no direction); a grid cell index keeps it near O(n)
  // TASKS.csv #2798 follow-up — 0.35 s of a 20,000-collar commit: the extent in one pass (no spreads), a numeric cell key (a collision only
  // adds candidates; the distance test decides), squared distances, no empty array per empty cell, and rings past the first by their edge
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const cell = Math.max(1, Math.sqrt(((x1 - x0 + 1) * (y1 - y0 + 1)) / pts.length));
  const grid = new Map(), key = (i, j) => i * 67108864 + j;
  pts.forEach((p, k) => { const q = key(Math.floor(p.x / cell), Math.floor(p.y / cell)); (grid.get(q) || grid.set(q, []).get(q)).push(k); });
  const bins = new Array(36).fill(0), bearings = [], nnDist = [];
  pts.forEach((p, k) => {
    let best = Infinity, bx = 0, by = 0;
    const ci = Math.floor(p.x / cell), cj = Math.floor(p.y / cell);
    const visit = (i, j) => {
      const list = grid.get(key(i, j));
      if (list) for (const m of list) {
        if (m === k) continue;
        const dx = pts[m].x - p.x, dy = pts[m].y - p.y, d2 = dx * dx + dy * dy;
        if (d2 > 0.25 && d2 < best) { best = d2; bx = dx; by = dy; }
      }
    };
    // ring 1 is the 3 x 3 square; a wider ring only while nothing was found, and only its edge (the cells inside held nothing usable)
    for (let r = 1; r <= 3 && !Number.isFinite(best); r++) {
      if (r === 1) { for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) visit(i, j); continue; }
      for (let d = -r; d <= r; d++) { visit(ci + d, cj - r); visit(ci + d, cj + r); }
      for (let d = -r + 1; d <= r - 1; d++) { visit(ci - r, cj + d); visit(ci + r, cj + d); }
    }
    if (!Number.isFinite(best)) return;
    best = Math.sqrt(best);
    const b = (((Math.atan2(bx, by) * 180) / Math.PI) + 360) % 180;
    bearings.push(b); nnDist.push(best); bins[Math.floor(b / 5) % 36]++;
  });
  if (bearings.length < 5) return null;
  let top = 0; bins.forEach((n, i) => { if (n > bins[top]) top = i; });
  // refine: the doubled-angle mean of the bearings within 15° of the busiest bin
  const c0 = top * 5 + 2.5, near = bearings.filter((b) => Math.abs(((b - c0 + 270) % 180) - 90) <= 15);
  const sx = near.reduce((s, b) => s + Math.sin((2 * b * Math.PI) / 180), 0), cy = near.reduce((s, b) => s + Math.cos((2 * b * Math.PI) / 180), 0);
  const azimuth = Math.round(((((Math.atan2(sx, cy) * 180) / Math.PI) / 2) + 180) % 180);
  // across the fences: the collars' offsets from a line through the median collar at that bearing; a gap wider than three quarters of the
  // collars' own spacing (the median nearest-neighbour distance, along a fence) starts a new fence; the spacing is the median between fences
  const ux = Math.sin((azimuth * Math.PI) / 180), uy = Math.cos((azimuth * Math.PI) / 180);
  const centre = { x: median(pts.map((p) => p.x)), y: median(pts.map((p) => p.y)) };
  const along = pts.map((p) => (p.x - centre.x) * ux + (p.y - centre.y) * uy);
  const across = pts.map((p) => (p.x - centre.x) * uy - (p.y - centre.y) * ux).sort((a, b) => a - b);
  const steps = []; for (let i = 1; i < across.length; i++) steps.push(across[i] - across[i - 1]);
  // #2176 — the cut-off once: median(nnDist) inside the filter sorted every distance again per collar (2.3 s of a 2,248-collar commit)
  const cut = Math.max(0.75 * median(nnDist), 10);
  const gaps = steps.filter((s) => s > cut);
  const spacing = gaps.length ? median(gaps) : null;
  const alongM = Math.max(...along) - Math.min(...along);
  return { azimuth, spacing: spacing ? Math.round(spacing) : null, alongM, centre };
}

const roundTo = (v, step) => Math.max(step, Math.round(v / step) * step);

// the fence-series and by-coordinates state, seeded from the drilling until the user sets a value
export function useDrillLineDefaults(collars) {
  const geo = useMemo(() => drillLineGeometry(collars), [collars]);
  const touched = useRef({});
  const [sliceSeriesAzimuth, setAz] = useState(0);
  const [sliceSeriesWidth, setW] = useState(50);
  const [typedSection, setTyped] = useState({ e: "", n: "", azimuth: 0, length: 500 });
  useEffect(() => {
    if (!geo) return;
    if (!touched.current.az) setAz(geo.azimuth);
    if (!touched.current.w && geo.spacing) setW(roundTo(geo.spacing, 10));
    if (!touched.current.typed) setTyped((s) => ({ ...s, azimuth: geo.azimuth, length: roundTo(geo.alongM * 1.1, 100) }));
  }, [geo]);
  return {
    sliceSeriesAzimuth, setSliceSeriesAzimuth: (v) => { touched.current.az = true; setAz(v); },
    sliceSeriesWidth, setSliceSeriesWidth: (v) => { touched.current.w = true; setW(v); },
    typedSection, setTypedSection: (v) => { touched.current.typed = true; setTyped(v); },
    lineCentre: geo?.centre || null,
    lineNote: geo ? (geo.spacing ? tr("Azimuth and width from the drill lines ({az}°, {s} m apart).", { az: geo.azimuth, s: geo.spacing }) : tr("Azimuth from the drill lines ({az}°).", { az: geo.azimuth })) : "",
  };
}
