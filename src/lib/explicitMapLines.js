// TASKS.csv #817 (part 2) — hard lines for an EXPLICIT surface (#811) taken from the geological map: the mapped contact
// between two units, draped on the terrain, is where the surface meets the ground, so the surface passes exactly
// through it, like a contact drawn on a section. Optionally a DIP GUIDE: the same line projected down its dip to a
// chosen depth, so the surface leaves the ground at the measured angle instead of whatever the spline extrapolates -
// the hand-drawn cross-section technique. A guide is a constructed line, not an observation, and is reported as such.
//
// mapContactLines(layer, field, units, groundAt, { step }) -> { lines: [{ ref, src: "map", pts: [{ x, y, z }] }], lengthM, offTerrain }
//   layer: a polygon map layer (features with .parts rings, project E/N); field: its unit attribute; units: [a, b], the
//   two units the contact separates. Every shared boundary of a and b (lib/mapLayers.js extractMapContacts) is thinned to
//   a point every `step` metres and draped with groundAt(E, N) (NaN = beyond the terrain: the line breaks there).
// dipGuideLines(lines, { measurements, depthM, radiusM, windowM, minDip, unitPolys, faults }) -> { lines, measured, fitted,
//   skipped, otherUnitReadings, acrossFaultPoints, disagree, maxDisagreeDeg }
//   For each point of each line, the dip to use: the measurements ({ x, y, dip, dipDir }, e.g. outcrop bedding) within
//   radiusM, averaged by inverse distance squared of their poles (mapLayers.js orientationAt, as #318's projection does -
//   TASKS.csv #872: it used to take the single nearest one, so the guide jumped 118 m between points 25 m apart where two
//   readings met), else the plane fitted to the contact's own trace over a windowM stretch (pileOrder.js fitTracePlane:
//   the rule of V's), else none (the point gets no guide). The guide point is depthM below the contact, moved
//   depthM / tan(dip) horizontally down-dip. Dips under minDip are skipped: the point would land kilometres away.
//   #872 — which readings may speak for this contact is the geologist's call (Matt: "let the user decide"):
//   unitPolys (the rings of the contact's two units) keeps only readings inside them; faults (mapped fault lines,
//   [[x, y], ...]) sets aside, for each guide point, a reading on the other side of a fault (the line from the point to it
//   crosses one). Both null / empty = every reading within the radius, as before. Where a measured dip and the trace's
//   own plane differ by more than disagreeDeg, the points are counted (disagree, maxDisagreeDeg): the data conflict.
// Pure: no three.js, no React.
import { extractMapContacts, orientationAt, pointInRings } from "./mapLayers.js";

// TASKS.csv #887 — the whole map's contacts, extracted once per (layer, field): every mapped pair and the pair picker used
// to re-extract them all (45-65 ms each on Perk-Rocky), on every keystroke in the dip-guide fields. A layer object is
// replaced, never edited in place, so it is a safe key.
const contactCache = new WeakMap();
function contactsOf(layer, field) {
  let byField = contactCache.get(layer);
  if (!byField) contactCache.set(layer, (byField = new Map()));
  if (!byField.has(field)) byField.set(field, extractMapContacts(layer, field));
  return byField.get(field);
}
import { fitTracePlane } from "./pileOrder.js";

function thin(line, step) {
  const out = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - acc;
    while (t <= L) { out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]); t += step; }
    acc = L - (t - step);
  }
  const last = line[line.length - 1], end = out[out.length - 1];
  if (Math.hypot(last[0] - end[0], last[1] - end[1]) > step / 4) out.push(last); // keep the line's own end
  return out;
}

// the unit pairs that share a boundary on the map, longest first: [{ units: [a, b], lengthM }]
export function mapContactPairs(layer, field) {
  if (!layer?.features?.length || !field) return [];
  return contactsOf(layer, field).contacts.map((c) => ({ units: c.units, lengthM: c.lengthM }));
}

export function mapContactLines(layer, field, units, groundAt, { step = 25 } = {}) {
  const [a, b] = units || [];
  const out = { lines: [], lengthM: 0, offTerrain: 0 };
  if (!layer?.features?.length || !field || a == null || b == null || a === b) return out;
  const want = [String(a), String(b)].sort((x, y) => x.localeCompare(y)).join("|");
  const c = contactsOf(layer, field).contacts.find((k) => k.units.map(String).sort((x, y) => x.localeCompare(y)).join("|") === want);
  if (!c) return out;
  out.lengthM = c.lengthM;
  const ref = `${a} | ${b}`;
  for (const line of c.lines) {
    let run = [];
    const flush = () => { if (run.length >= 2) out.lines.push({ ref, src: "map", pts: run }); run = []; };
    for (const [x, y] of thin(line, step)) {
      const z = groundAt ? groundAt(x, y) : NaN;
      if (!Number.isFinite(z)) { out.offTerrain++; flush(); continue; }
      run.push({ x, y, z });
    }
    flush();
  }
  return out;
}

// do segments p-q and a-b cross (proper or touching)?
function segCross(p, q, a, b) {
  const o = (u, v, w) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
  const d1 = o(a, b, p), d2 = o(a, b, q), d3 = o(p, q, a), d4 = o(p, q, b);
  return d1 !== d2 && d3 !== d4;
}
const pole = (dip, dx, dy) => { const s = Math.sin((dip * Math.PI) / 180); return [s * dx, s * dy, Math.cos((dip * Math.PI) / 180)]; };

export function dipGuideLines(lines, { measurements = [], depthM = 100, radiusM = 500, windowM = 800, minDip = 10, unitPolys = null, faults = [], disagreeDeg = 30 } = {}) {
  let meas = measurements.filter((m) => [m.x, m.y, m.dip, m.dipDir].every(Number.isFinite));
  const res = { lines: [], measured: 0, fitted: 0, skipped: 0, otherUnitReadings: 0, acrossFaultPoints: 0, disagree: 0, maxDisagreeDeg: 0 };
  if (!(depthM > 0)) return res;
  // #872 — readings outside the contact's own two units, when asked to leave them out
  if (unitPolys?.length) {
    const keep = meas.filter((m) => unitPolys.some((rings) => pointInRings([m.x, m.y], rings)));
    res.otherUnitReadings = meas.length - keep.length;
    meas = keep;
  }
  const faultSegs = [];
  for (const f of faults || []) for (let i = 1; i < (f?.length || 0); i++) faultSegs.push([f[i - 1], f[i]]);
  const R2 = radiusM * radiusM;
  for (const l of lines) {
    // the trace's own plane, one per windowM stretch along the line
    const cum = [0];
    for (let i = 1; i < l.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(l.pts[i].x - l.pts[i - 1].x, l.pts[i].y - l.pts[i - 1].y));
    const planes = new Map();
    const planeAt = (i) => {
      const w = Math.floor(cum[i] / windowM);
      if (!planes.has(w)) {
        const pts = l.pts.filter((_, j) => cum[j] >= (w - 0.25) * windowM && cum[j] < (w + 1.25) * windowM).map((p) => [p.x, p.y, p.z]);
        const pl = fitTracePlane(pts);
        planes.set(w, pl && pl.dipDir != null ? pl : null);
      }
      return planes.get(w);
    };
    let run = [];
    const flush = () => { if (run.length >= 2) res.lines.push({ ref: `${l.ref} (dip guide)`, src: "guide", pts: run }); run = []; };
    l.pts.forEach((p, i) => {
      // the readings within the radius that may speak for this point (#872: not across a mapped fault)
      let near = meas.filter((m) => (m.x - p.x) ** 2 + (m.y - p.y) ** 2 <= R2);
      if (faultSegs.length && near.length) {
        const ok = near.filter((m) => !faultSegs.some(([a, b]) => segCross([p.x, p.y], [m.x, m.y], a, b)));
        if (ok.length < near.length) res.acrossFaultPoints++;
        near = ok;
      }
      const best = near.length ? orientationAt(p.x, p.y, near, radiusM) : null; // inverse-distance mean of the poles (#872)
      let dip, dx, dy;
      if (best) {
        dip = best.dip;
        const az = (best.dipDir * Math.PI) / 180;
        dx = Math.sin(az); dy = Math.cos(az);
        const pl = planeAt(i);
        if (pl) { // #872 — the reading and the trace's own rule-of-V plane disagree: say so
          const a = pole(dip, dx, dy), b = pole(pl.dip, pl.dx, pl.dy);
          const ang = (Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
          if (ang > disagreeDeg) { res.disagree++; res.maxDisagreeDeg = Math.max(res.maxDisagreeDeg, Math.round(ang)); }
        }
      } else {
        const pl = planeAt(i);
        if (pl) { dip = pl.dip; dx = pl.dx; dy = pl.dy; }
      }
      if (!(dip >= minDip)) { res.skipped++; flush(); return; }
      if (best) res.measured++; else res.fitted++;
      const h = dip >= 89.9 ? 0 : depthM / Math.tan((dip * Math.PI) / 180);
      run.push({ x: p.x + dx * h, y: p.y + dy * h, z: p.z - depthM });
    });
    flush();
  }
  return res;
}
