// TASKS.csv #3910 (platform redesign P8, design.md section 5) — the trend helper: one to four candidate trends ranked from the project's own data,
// each with a strength (strong, fair, weak), a plain reason and its warnings. Where a candidate comes from, best-supported source first:
//   1. measured structures (oriented core picks, outcrop readings): the mean plane of one kind (lib/trend.js planeFromPoles, the stereonet's
//      fisherStats / fabricShape for how tightly they agree; a girdle is a fold, not one plane, and is left out);
//   2. shapes already modelled (a surface's best-fit plane) and logged contacts (the best-fit plane of one unit's tops): "from a model, not a
//      measurement";
//   3. the grade itself: the plane the samples at or above the cut-off lie on (lib/samplesTrend.js), tested against the drilling (#3782,
//      lib/drillingPlane.js): a plane that is just the drill pattern is said so, weak, and never pre-selected;
//   4. the geology map: the direction mapped contacts run (direction only, tilt unknown).
// No deposit style is assumed and every candidate is a suggestion with its reason, never a fact (#264). Pure: the caller hands over the points.
import { planeFromPoles, poleOf, planeFromPoints, cleanTrend } from "./trend.js";
import { fisherStats, fabricShape } from "./stereonet.js";
import { samplesTrendByArea, samplesTrend } from "./samplesTrend.js";
import { planeVsDrilling } from "./drillingPlane.js";
import { fitPlane } from "./vein.js";
import { t as tr } from "./i18n.js";

export const MAX_CANDIDATES = 4, PER_SOURCE = 2, AGREE_DEG = 20, MIN_PICKS = 3, MIN_TOPS = 3, FEW_READINGS = 10, FAR_M = 1000;
export const STRENGTH_RATIOS = { gentle: 2, medium: 3, strong: 5 }; // Step 3, 'How strongly?': medium is the start
const RANK = { structures: 1, model: 2, contacts: 2, grade: 3, map: 4 };
const LEVEL = { strong: 3, fair: 2, weak: 1 };
const deg = 180 / Math.PI;
const n360 = (a) => ((a % 360) + 360) % 360;
const r0 = (v) => Math.round(v);
const finite = (p) => [p?.x, p?.y, p?.z].every(Number.isFinite);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const poleAngle = (a, b) => Math.acos(Math.min(1, Math.abs(dot(poleOf(a.dip, a.dipAzimuth), poleOf(b.dip, b.dipAzimuth))))) * deg;
const strikeAngle = (a, b) => { const d = Math.abs(n360(a - b)) % 180; return Math.min(d, 180 - d); }; // two strikes as axes, 0-90

// ---------- words ----------
// the strike as an axis (0-180) in four words; the tilt in four steps; the dip direction in eight
function strikeWords(dipAzimuth) {
  const s = n360(dipAzimuth - 90) % 180;
  if (s < 22.5 || s >= 157.5) return tr("north–south");
  if (s < 67.5) return tr("north-east to south-west");
  if (s < 112.5) return tr("east–west");
  return tr("north-west to south-east");
}
function towardsWords(az) {
  const i = Math.round(n360(az) / 45) % 8;
  return [tr("to the north"), tr("to the north-east"), tr("to the east"), tr("to the south-east"), tr("to the south"), tr("to the south-west"), tr("to the west"), tr("to the north-west")][i];
}
// "Runs north-east to south-west and tilts steeply to the south-east." — a direction-only candidate: "…; its tilt is unknown."
export function describeCandidate(c) {
  if (!c) return "";
  const strike = strikeWords(c.dipAzimuth);
  if (c.directionOnly) return tr("Runs {strike}; its tilt is unknown.", { strike });
  const towards = towardsWords(c.dipAzimuth);
  if (c.dip < 10) return tr("Lies nearly flat.");
  if (c.dip < 35) return tr("Runs {strike} and tilts gently {towards}.", { strike, towards });
  if (c.dip < 60) return tr("Runs {strike} and tilts moderately {towards}.", { strike, towards });
  if (c.dip < 80) return tr("Runs {strike} and tilts steeply {towards}.", { strike, towards });
  return tr("Runs {strike} and stands nearly upright.", { strike });
}
export const strengthWord = (s) => ({ strong: tr("strong"), fair: tr("fair"), weak: tr("weak") })[s] || s;
// the numbers behind the words, for those who read them: "dip 62° → 135°" / "strike 045°"
export const candidateNumbers = (c) => (c.directionOnly ? tr("strike {s}°", { s: String(r0(n360(c.dipAzimuth - 90) % 180)).padStart(3, "0") }) : tr("dip {dip}° → {az}°", { dip: r0(c.dip), az: String(r0(c.dipAzimuth)).padStart(3, "0") }));

// ---------- the candidates, one source at a time ----------
// structures: [{ kind, dip, dipDir, x?, y? }] (a pick's azimuth is its dip direction) -> one candidate per kind with enough readings
function fromStructures(structures, zone) {
  const byKind = new Map();
  for (const s of structures || []) {
    if (!Number.isFinite(s?.dip) || !Number.isFinite(s?.dipDir)) continue;
    const k = String(s.kind ?? "").trim() || tr("structure");
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(s);
  }
  const out = [];
  for (const [kind, rows] of byKind) {
    if (rows.length < MIN_PICKS) continue;
    const plane = planeFromPoles(rows.map((p) => poleOf(p.dip, p.dipDir)));
    if (!plane) continue;
    const st = fisherStats(rows.map((p) => ({ dip: p.dip, azimuth: p.dipDir, dipDir: p.dipDir })));
    const fab = st ? fabricShape(st.s1, st.s2, st.s3, rows.length) : null;
    if (fab?.shape === "girdle") continue; // a fold: no one mean plane (TrendsPanel refuses it too)
    const n = rows.length, s1 = st ? st.s1 : plane.s1;
    let strength = st?.noPreferred ? "weak" : s1 >= 0.75 && n >= FEW_READINGS ? "strong" : s1 >= 0.55 ? "fair" : "weak";
    const warnings = [];
    if (n < FEW_READINGS) { warnings.push(tr("From only {n} readings.", { n })); if (strength === "strong") strength = "fair"; }
    if (st?.noPreferred) warnings.push(tr("The readings are no more aligned than random planes."));
    const placed = rows.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (zone && placed.length) {
      const d = placed.map((p) => Math.hypot(Math.max(zone.x0 - p.x, 0, p.x - zone.x1), Math.max(zone.y0 - p.y, 0, p.y - zone.y1))).sort((a, b) => a - b);
      const far = d[Math.floor((d.length - 1) / 2)];
      if (far > FAR_M) { warnings.push(tr("The readings are far from this zone (about {km} km).", { km: (far / 1000).toFixed(1) })); if (strength === "strong") strength = "fair"; }
    }
    out.push({ id: `structures:${kind}`, source: "structures", kind, dip: plane.dip, dipAzimuth: plane.dipAzimuth, n, strength, score: s1,
      reason: tr(n === 1 ? "The mean of {n} {kind} reading." : "The mean of {n} {kind} readings.", { n, kind }), warnings });
  }
  return out;
}
// how planar a point set is (RMS off its plane over its extent): strong under 10 %, fair under 25 %
const planarStrength = (rough) => (rough == null ? "weak" : rough < 0.1 ? "strong" : rough < 0.25 ? "fair" : "weak");
// surfaces: [{ id, name, pts }] -> the best-fit plane of each modelled shape; never strong (a model, not a measurement)
function fromModels(surfaces) {
  const out = [];
  for (const s of surfaces || []) {
    const pts = (s?.pts || []).filter(finite);
    if (pts.length < 3) continue;
    const fit = fitPlane(pts);
    if (fit && fit.collinearity < 0.02) continue; // along a line: no plane
    const plane = planeFromPoints(pts);
    if (!plane) continue;
    const rough = fit && Number.isFinite(fit.planarity) ? fit.planarity : null;
    const strength = planarStrength(rough) === "strong" ? "fair" : planarStrength(rough);
    const warnings = [tr("From a model, not a measurement.")];
    if (rough != null && rough >= 0.25) warnings.push(tr("The shape is far from one plane."));
    out.push({ id: `model:${s.id ?? s.name}`, source: "model", kind: s.name, dip: plane.dip, dipAzimuth: plane.dipAzimuth, n: pts.length, strength, score: rough == null ? 0 : 1 - rough,
      reason: tr("The best-fit plane of the modelled shape {name}.", { name: s.name || tr("the surface") }), warnings });
  }
  return out;
}
// units: [{ code, pts }] (one top per hole) -> the best-fit plane of each unit's logged tops: the contacts the holes cut
function fromContacts(units, drillingPts) {
  const out = [];
  for (const u of units || []) {
    const pts = (u?.pts || []).filter(finite);
    if (pts.length < MIN_TOPS) continue;
    const fit = fitPlane(pts);
    if (fit && fit.collinearity < 0.02) continue;
    const plane = planeFromPoints(pts);
    if (!plane) continue;
    const rough = fit && Number.isFinite(fit.planarity) ? fit.planarity : null;
    let strength = planarStrength(rough);
    if (strength === "strong" && pts.length < 8) strength = "fair";
    const warnings = [tr("From logged contacts, not a measurement.")];
    if (pts.length < 8) warnings.push(tr("From only {n} contacts.", { n: pts.length }));
    const dv = drillingPts?.length ? planeVsDrilling({ ...plane, ratios: samplesTrend(pts)?.ratios }, drillingPts, pts.length, { usedPts: pts }) : null;
    if (dv?.drilling) { warnings.push(tr("This is also the direction of your drilling: it may be the drill pattern, not the rock.")); strength = "weak"; }
    out.push({ id: `contacts:${u.code}`, source: "contacts", kind: u.code, dip: plane.dip, dipAzimuth: plane.dipAzimuth, n: pts.length, strength, score: rough == null ? 0 : 1 - rough, drilling: !!dv?.drilling,
      reason: tr("The best-fit plane of {n} logged tops of {code}.", { n: pts.length, code: u.code }), warnings });
  }
  return out;
}
// grade: { element, cutoff, unit, pts } (the samples at or above the cut-off); drillingPts: every sample of the area, grade ignored
function fromGrade(grade, drillingPts) {
  const pts = (grade?.pts || []).filter(finite);
  if (pts.length < 8) return [];
  const area = samplesTrendByArea(pts), st = area?.trend;
  if (!st) return [];
  const flat = st.ratios.int / (st.ratios.min || 1); // how much flatter than thick the grade lies
  let strength = flat >= 4 && st.n >= 30 ? "strong" : flat >= 2 ? "fair" : "weak";
  const warnings = [];
  const dv = drillingPts?.length ? planeVsDrilling(st, drillingPts, st.n, { usedPts: pts }) : null;
  if (dv?.drilling) { warnings.push(tr("This is also the direction of your drilling: it may be the drill pattern, not the rock.")); strength = "weak"; }
  if (area.leftOut) warnings.push(tr("{n} samples in other areas more than 500 m away were left out.", { n: area.leftOut.toLocaleString() }));
  return [{ id: `grade:${grade.element}`, source: "grade", kind: grade.element, dip: st.dip, dipAzimuth: st.dipAzimuth, pitch: st.pitch, n: st.n, strength, score: flat, drilling: !!dv?.drilling,
    reason: tr("The plane the {n} {el} samples at or above {cut} {unit} lie on.", { n: st.n.toLocaleString(), el: grade.element, cut: grade.cutoff, unit: grade.unit || "" }).replace(/\s+\./, "."), warnings }];
}
// mapContacts: [{ name, lines: [[[x, y], ...], ...] }] -> the direction the mapped contacts run (length-weighted, as axes: doubled angles)
function fromMap(mapContacts) {
  let sx = 0, sy = 0, len = 0, n = 0;
  for (const c of mapContacts || []) for (const line of c?.lines || []) {
    for (let i = 1; i < (line?.length || 0); i++) {
      const dx = line[i][0] - line[i - 1][0], dy = line[i][1] - line[i - 1][1], l = Math.hypot(dx, dy);
      if (!(l > 0)) continue;
      const a = 2 * Math.atan2(dx, dy); sx += l * Math.sin(a); sy += l * Math.cos(a); len += l;
    }
    n++;
  }
  if (!(len > 0) || n < 1) return [];
  const R = Math.hypot(sx, sy) / len; // 1 = every contact runs one way, 0 = no grain
  if (R < 0.2) return [];
  const strike = n360((Math.atan2(sx, sy) * deg) / 2) % 180;
  return [{ id: "map", source: "map", kind: null, dip: 90, dipAzimuth: n360(strike + 90), directionOnly: true, n, strength: R >= 0.6 ? "fair" : "weak", score: R,
    reason: tr("The direction {n} mapped contacts run.", { n }), warnings: [tr("Tilt unknown: the trend stretches along this direction and assumes no tilt.")] }];
}

// ---------- the ranked list ----------
// -> { candidates: [...] (at most MAX_CANDIDATES, best first; each { id, source, kind, dip, dipAzimuth, pitch?, directionOnly?, n, strength,
//    reason, warnings, words, numbers, drilling?, agreesWith: [ids], suggested }), suggestedId, none: bool, noneText }
export function trendCandidates({ structures = [], surfaces = [], units = [], grade = null, drillingPts = null, mapContacts = [], max = MAX_CANDIDATES } = {}) {
  const drill = (drillingPts || []).filter(finite);
  const zone = drill.length ? drill.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }) : null;
  const all = [...fromStructures(structures, zone), ...fromModels(surfaces), ...fromContacts(units, drill), ...fromGrade(grade, drill), ...fromMap(mapContacts)];
  // two independent candidates (different sources) within AGREE_DEG of each other agree: the strongest support a beginner can be shown
  for (const c of all) c.agreesWith = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.source === b.source || a.drilling || b.drilling) continue;
    const ang = a.directionOnly || b.directionOnly ? strikeAngle(a.dipAzimuth - 90, b.dipAzimuth - 90) : poleAngle(a, b);
    if (ang <= AGREE_DEG) { a.agreesWith.push(b.id); b.agreesWith.push(a.id); }
  }
  const support = (c) => LEVEL[c.strength] + (c.agreesWith.length ? 0.5 : 0) - (c.drilling ? 2 : 0);
  all.sort((a, b) => support(b) - support(a) || RANK[a.source] - RANK[b.source] || b.score - a.score || b.n - a.n);
  // at most PER_SOURCE from one source while another source has a candidate (four kinds of core picks would hide the grade and the contacts)
  const cap = Math.max(1, max), candidates = [], left = [];
  for (const c of all) (candidates.length < cap && candidates.filter((o) => o.source === c.source).length < PER_SOURCE ? candidates : left).push(c);
  for (const c of left) if (candidates.length < cap) candidates.push(c);
  candidates.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  const best = candidates.find((c) => !c.drilling && LEVEL[c.strength] >= LEVEL.fair) || null;
  for (const c of candidates) {
    c.suggested = c === best;
    c.words = describeCandidate(c);
    c.numbers = candidateNumbers(c);
    if (c.agreesWith.length) {
      const other = candidates.find((o) => c.agreesWith.includes(o.id));
      if (other) c.agreeText = tr("These two agree: {a} and {b}.", { a: c.reason.replace(/\.$/, ""), b: other.reason.replace(/\.$/, "").replace(/^./, (x) => x.toLowerCase()) });
    }
  }
  const none = !best;
  return { candidates, suggestedId: best?.id || null, none,
    noneText: none ? tr("Your data does not show a clear direction. That is common with few holes. Carry on without a trend; you can add one later.") : null };
}

// ---------- into Model settings' trend store ----------
// What follows the trend (Step 1): the grade model, one rock or vein, or everything (TrendsPanel's TREND_USERS; faults keep their own, #679)
export const FOLLOW_TOOLS = { grade: ["gradeShell", "estimation"], rock: ["implicit", "alteration", "explicit"], everything: ["implicit", "alteration", "gradeShell", "estimation", "geoml", "explicit"] };
// a candidate (or a typed { dip, dipAzimuth }) and a strength -> a trend for lib/trend.js: a plane stretched along both its lines; a direction-only
// candidate stretches along its strike only (an upright plane, pitch 0, the other two axes equal: no tilt assumed)
export function trendFromCandidate(c, strength = "medium", name = null) {
  const k = STRENGTH_RATIOS[strength] || STRENGTH_RATIOS.medium;
  if (!c || !Number.isFinite(c.dipAzimuth) || (!c.directionOnly && !Number.isFinite(c.dip))) return null;
  const label = name || (c.directionOnly ? `Trend: strike ${r0(n360(c.dipAzimuth - 90) % 180)}°` : `Trend: ${r0(c.dip)}° → ${r0(n360(c.dipAzimuth))}°`);
  if (c.directionOnly) return cleanTrend({ name: label, dip: 90, dipAzimuth: c.dipAzimuth, pitch: 0, ratios: { max: k, int: 1, min: 1 } });
  return cleanTrend({ name: label, dip: c.dip, dipAzimuth: c.dipAzimuth, pitch: Number.isFinite(c.pitch) ? c.pitch : 90, ratios: { max: k, int: k, min: 1 } });
}
// the store's next state: the trend added (or replacing the one this helper wrote before, `id`) and used by the tools that follow it
export function withHelperTrend(state, trend, follow = "everything", id = "trend_helper") {
  if (!trend) return state;
  const s = state || { trends: [], use: {} };
  const t = { ...trend, id, fromHelper: true };
  const trends = (s.trends || []).some((x) => x.id === id) ? s.trends.map((x) => (x.id === id ? t : x)) : [...(s.trends || []), t];
  const use = { ...(s.use || {}) };
  for (const tool of FOLLOW_TOOLS[follow] || FOLLOW_TOOLS.everything) use[tool] = id;
  return { ...s, trends, use };
}


// ---------- TASKS.csv #3917: "I know my trend" from three points clicked in the 3D view, or from a modelled or imported surface ----------
export const LINE_DEG = 5, FLAT_DIP = 2; // three points within 5° of a line fix no plane; a plane under 2° gives no direction along the ground
// pts: three { x, y, z } (east, north, up) -> a candidate like the typed one ({ id: "typed", source: "points", dip, dipAzimuth, words, numbers,
// note }) or { error } said plainly: too few, the same place, or nearly in a line
export function planeFromThreePoints(pts) {
  const P = (pts || []).filter((p) => [p?.x, p?.y, p?.z].every(Number.isFinite));
  if (P.length < 3) return { error: tr("Click three points: {n} so far.", { n: P.length }) };
  const [a, b, c] = P;
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const lu = Math.hypot(u.x, u.y, u.z), lv = Math.hypot(v.x, v.y, v.z), ln = Math.hypot(n.x, n.y, n.z);
  if (!(lu > 0.01) || !(lv > 0.01) || Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) <= 0.01) return { error: tr("Two of the points are in the same place: click three different points.") };
  // the smallest angle of the triangle: nearly 0 when the three points lie almost in a line
  const angAt = (p, q, r) => { const s = { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z }, t = { x: r.x - p.x, y: r.y - p.y, z: r.z - p.z }; return Math.acos(Math.max(-1, Math.min(1, (s.x * t.x + s.y * t.y + s.z * t.z) / (Math.hypot(s.x, s.y, s.z) * Math.hypot(t.x, t.y, t.z))))) * deg; };
  const minAng = Math.min(angAt(a, b, c), angAt(b, a, c), angAt(c, a, b));
  if (!(ln > 0) || minAng < LINE_DEG) return { error: tr("The three points lie nearly in a line, so they don't fix a plane: click a point well off the line of the other two.") };
  const nz = n.z < 0 ? -1 : 1, nx = n.x * nz / ln, ny = n.y * nz / ln, nzz = n.z * nz / ln; // the upward normal leans towards the dip direction
  const dip = Math.acos(Math.min(1, nzz)) * deg, dipAzimuth = dip < 1e-6 ? 0 : n360(Math.atan2(nx, ny) * deg);
  return knownCandidate({ source: "points", dip, dipAzimuth });
}
// a surface's points -> its best-fit plane, with how far the surface strays from it (RMS off the plane over its extent) as the strength;
// along a line: { error }
export function surfaceTrend(name, pts) {
  const P = (pts || []).filter(finite);
  if (P.length < 3) return { error: tr("{name} has too few points to fit a plane.", { name: name || tr("the surface") }) };
  const fit = fitPlane(P);
  if (fit && fit.collinearity < 0.02) return { error: tr("{name} lies along a line, so it doesn't fix a plane.", { name: name || tr("the surface") }) };
  const plane = planeFromPoints(P);
  if (!plane) return { error: tr("{name} has too few points to fit a plane.", { name: name || tr("the surface") }) };
  const rough = fit && Number.isFinite(fit.planarity) ? fit.planarity : null;
  const c = knownCandidate({ source: "surface", dip: plane.dip, dipAzimuth: plane.dipAzimuth, strength: planarStrength(rough) });
  c.spread = rough == null ? null : tr("It strays {pct} % of its extent from that plane on average.", { pct: Math.round(rough * 100) });
  c.reason = tr("The best-fit plane of {name}.", { name: name || tr("the surface") });
  return c;
}
function knownCandidate({ source, dip, dipAzimuth, strength = null }) {
  const c = { id: "typed", source, dip, dipAzimuth, strength, agreesWith: [], warnings: [] };
  c.words = describeCandidate(c);
  c.numbers = candidateNumbers(c);
  if (dip < FLAT_DIP) c.note = tr("It lies flat (a tilt under {d}°): it gives no direction along the ground, only a flat plane.", { d: FLAT_DIP });
  return c;
}
