// TASKS.csv #817 — a suggested stratigraphic order for the units of a geological map, from the map itself and its bedding
// measurements, for the map-only model. Matt: "tool should suggest strat order and let the user adjust it". It is a
// SUGGESTION with its evidence shown: the geologist reorders it.
//
//  1. Roles from the unit's code and description: intrusive rocks (diorite, granite, porphyry, dyke...), cross-cutting
//     bodies (breccias, veins), "other" (hornfels, skarn, overburden-like units) and everything else stratigraphic.
//  2. Younging across each contact between two stratigraphic units (lib/mapLayers.extractMapContacts): beds dip
//     towards the younger unit (the law of superposition for upright beds). At samples along the contact, every bedding
//     measurement within `radiusM` votes for the side its dip direction points to, weighted by
//     |cos(angle to the contact normal)| x sin(dip) x (1 - distance / radius). Samples within `faultBufferM` of a mapped
//     fault are left out: a thrust puts older rock over younger, against the rule. A contact that FOLLOWS a fault (more
//     than half of it within `faultContactM`) is a faulted contact and casts no vote at all: on Perk-Rocky (ARIS 42317)
//     the schist / andesite and andesite / sandstone contacts lie a median ~120 m from the two mapped thrusts (the lines
//     are drawn a little off the polygon edges), and with only the per-sample buffer they put schist at the top. OVERTURNED beds reverse it too, and
//     cannot be told from a map - one more reason this is only a suggestion.
//     With a terrain, each contact is also cut into ~`windowM` stretches and each stretch's own dip is fitted from its
//     draped trace (fitTracePlane): it votes for the side it dips towards, weighted by planarity and length - the classic
//     map method, independent of the bedding.
//  3. Units are ranked by their net votes (younger over a neighbour = +, older = -), normalised by the votes they
//     took part in; units with no bedding evidence are placed by the mean ground elevation along their contacts
//     (higher = younger, a weak rule), else by area.
// Returns { order (youngest first, stratigraphic only), roles: { unit: role }, pairs: [{ a, b, younger, older,
// weight, measurements, samples }], units: [{ unit, role, areaKm2, score, evidence }] }.
import { extractMapContacts, pointInRings } from "./mapLayers.js";
import { eigSym3 } from "./explicitSurface.js";

// TASKS.csv #817 — the dip of a contact from its own trace draped on the terrain (the three-point problem / the rule of
// V's): a plane fitted (PCA) to the trace's (x, y, ground z) points. Usable only when the trace bends in 3D enough to fix
// a plane (middle eigenvalue >= minPlanarity x largest) and its points lie close to it (rms <= maxRmsM); a straight trace
// on flat ground says nothing. Returns { dip, dipDir, dx, dy (unit down-dip direction, east / north), rmsM } or null.
export function fitTracePlane(pts, { minPlanarity = 0.01, maxRmsM = 15, minReliefM = 20 } = {}) {
  if (pts.length < 6) return null;
  const zs = pts.map((p) => p[2]);
  if (Math.max(...zs) - Math.min(...zs) < minReliefM) return null;
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const { values, vectors } = eigSym3(C);
  if (!(values[1] >= minPlanarity * values[2])) return null;
  const rmsM = Math.sqrt(Math.max(0, values[0]) / pts.length);
  if (rmsM > maxRmsM) return null;
  let [nx, ny, nz] = vectors[0];
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  const h = Math.hypot(nx, ny);
  if (h < 1e-6) return { dip: 0, dipDir: null, dx: 0, dy: 0, rmsM };
  return { dip: (Math.atan2(h, nz) * 180) / Math.PI, dipDir: ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360, dx: nx / h, dy: ny / h, rmsM };
}

const INTRUSIVE = /\b(qz|q|mic|f)?(dio|diorite|grd|granodiorite|gra|granite|ton|tonalite|mon|monzonite|syn|syenite|gab|gabbro|porph|porphyry|fp|qfp|dyke|dike|sill|intrusi\w*|plug|stock|aplite|pegmatite|diabase|dolerite|lamprophyre)\b/i;
const CROSS = /(breccia|\bbx\b|hbx|vein|\bqv\b|fault|gouge|mylonite)/i;
const OTHER = /(hornfels|\bhfs\b|skarn|\bsk\b|till|overburden|alluvium|colluvium|glacial|\bobn\b|\bovb\b|gossan)/i;

// "stratigraphic" | "intrusion" | "cross-cutting" | "other", from a unit code and (optionally) its description
export function classifyUnitRole(code, description = "") {
  const s = `${code || ""} ${description || ""}`;
  if (OTHER.test(s)) return "other";
  if (CROSS.test(s)) return "cross-cutting";
  // codes such as "QzDio" / "MicDio" / "DioF": split camel case before matching
  const words = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])([A-Z][a-z])/g, "$1 $2");
  if (INTRUSIVE.test(words) || INTRUSIVE.test(s)) return "intrusion";
  return "stratigraphic";
}

const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
};
const nearLines = (p, lines, d) => lines.some((ln) => { for (let i = 0; i < ln.length - 1; i++) if (segDist(p, ln[i], ln[i + 1]) < d) return true; return false; });

export function suggestPileOrder({ layer, field, descField = null, bedding = [], faults = [], groundAt = null, radiusM = 400, faultBufferM = 150, faultContactM = 300, sampleStepM = 25, windowM = 800, traceVoteWeight = 20 }) {
  const units = new Map(); // unit -> { area, desc, polys: [parts] }
  const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
  for (const f of layer.features) {
    const u = String(f.attributes?.[field] ?? "").trim();
    if (!u) continue;
    if (!units.has(u)) units.set(u, { area: 0, desc: descField ? String(f.attributes?.[descField] ?? "") : "", polys: [] });
    const e = units.get(u);
    const rings = f.parts || [f.geometry];
    e.area += rings.reduce((s, r, i) => s + (i === 0 ? ringArea(r) : -ringArea(r)), 0);
    e.polys.push(rings);
  }
  const roles = {};
  for (const [u, e] of units) roles[u] = classifyUnitRole(u, e.desc);
  const inUnit = (p, u) => units.get(u).polys.some((rings) => pointInRings(p, rings));
  const beds = bedding.filter((b) => [b.x, b.y, b.dip, b.dipDir].every(Number.isFinite) && b.dip > 2);
  const faultLines = faults.filter((l) => l && l.length > 1);
  const { contacts } = extractMapContacts(layer, field);
  const pairs = [];
  const elevSum = new Map(); // unit -> [sum, n] of ground elevation just inside its side of a contact
  for (const c of contacts) {
    const [a, b] = c.units;
    if (!units.has(a) || !units.has(b)) continue;
    // a faulted contact (follows a mapped fault): listed, no votes
    if (faultLines.length) {
      const pts = c.lines.flat();
      const near = pts.filter((p) => nearLines(p, faultLines, faultContactM)).length;
      if (pts.length && near / pts.length > 0.5) { pairs.push({ a, b, younger: null, older: null, weight: 0, agreement: 0, measurements: 0, samples: 0, lengthM: c.lengthM, faulted: true }); continue; }
    }
    let wa = 0, wb = 0, samples = 0;
    const used = new Set();
    for (const line of c.lines) {
      let acc = 0;
      for (let i = 1; i < line.length; i++) {
        const p0 = line[i - 1], p1 = line[i];
        acc += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (acc < sampleStepM) continue;
        acc = 0;
        const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
        let nx = -(p1[1] - p0[1]) / L, ny = (p1[0] - p0[0]) / L; // a normal to the contact
        const p = p1, eps = 6;
        const plus = [p[0] + nx * eps, p[1] + ny * eps], minus = [p[0] - nx * eps, p[1] - ny * eps];
        if (inUnit(minus, a) && !inUnit(plus, a)) { nx = -nx; ny = -ny; } // make n point into unit a
        else if (!inUnit(plus, a)) continue; // neither side resolved (a sliver or an overlap): skip the sample
        const inA = [p[0] + nx * 40, p[1] + ny * 40], inB = [p[0] - nx * 40, p[1] - ny * 40];
        if (groundAt) {
          for (const [u, q] of [[a, inA], [b, inB]]) { const g = groundAt(q[0], q[1]); if (Number.isFinite(g)) { const s = elevSum.get(u) || [0, 0]; s[0] += g; s[1]++; elevSum.set(u, s); } }
        }
        if (faultLines.length && nearLines(p, faultLines, faultBufferM)) continue;
        samples++;
        beds.forEach((m, k) => {
          const d = Math.hypot(m.x - p[0], m.y - p[1]);
          if (d > radiusM) return;
          const az = (m.dipDir * Math.PI) / 180, dx = Math.sin(az), dy = Math.cos(az); // dip direction, east / north
          const cosA = dx * nx + dy * ny, w = Math.abs(cosA) * Math.sin((m.dip * Math.PI) / 180) * (1 - d / radiusM);
          if (cosA > 0) wa += w; else wb += w; // dipping towards a: a is the younger side
          used.add(k);
        });
      }
    }
    const bedA = wa, bedB = wb;
    // the contact's own dip from its draped trace, stretch by stretch
    let ta = 0, tb = 0, planes = 0;
    const fitted = [];
    if (groundAt) {
      for (const line of c.lines) {
        let chunk = [], len = 0;
        const flush = () => {
          if (chunk.length >= 6) {
            const pts3 = chunk.map((q) => [q[0], q[1], groundAt(q[0], q[1])]).filter((q) => Number.isFinite(q[2]));
            const pl = fitTracePlane(pts3);
            const mid = chunk[chunk.length >> 1], nxt = chunk[Math.min(chunk.length - 1, (chunk.length >> 1) + 1)];
            if (pl && pl.dipDir != null && pl.dip > 5 && !(faultLines.length && nearLines(mid, faultLines, faultBufferM))) {
              const L = Math.hypot(nxt[0] - mid[0], nxt[1] - mid[1]) || 1;
              let nx = -(nxt[1] - mid[1]) / L, ny = (nxt[0] - mid[0]) / L;
              const plus = [mid[0] + nx * 6, mid[1] + ny * 6], minus = [mid[0] - nx * 6, mid[1] - ny * 6];
              let ok = true;
              if (inUnit(minus, a) && !inUnit(plus, a)) { nx = -nx; ny = -ny; } else if (!inUnit(plus, a)) ok = false;
              if (ok) {
                const cosA = pl.dx * nx + pl.dy * ny, w = traceVoteWeight * Math.abs(cosA) * Math.min(1, len / windowM);
                if (cosA > 0) ta += w; else tb += w;
                planes++;
                fitted.push({ x: mid[0], y: mid[1], dip: pl.dip, dipDir: pl.dipDir, rmsM: pl.rmsM });
              }
            }
          }
          chunk = [chunk[chunk.length - 1]].filter(Boolean); len = 0;
        };
        for (let i = 0; i < line.length; i++) {
          if (i) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
          chunk.push(line[i]);
          if (len >= windowM) flush();
        }
        if (len > windowM / 3) flush();
      }
    }
    wa += ta; wb += tb;
    const weight = wa + wb;
    pairs.push({ a, b, younger: weight ? (wa >= wb ? a : b) : null, older: weight ? (wa >= wb ? b : a) : null, weight, agreement: weight ? Math.max(wa, wb) / weight : 0, measurements: used.size, samples, lengthM: c.lengthM,
      bedding: { a: bedA, b: bedB }, trace: { a: ta, b: tb, planes }, fittedPlanes: fitted });
  }
  // rank the stratigraphic units
  const strat = [...units.keys()].filter((u) => roles[u] === "stratigraphic");
  const score = new Map(strat.map((u) => [u, 0])), took = new Map(strat.map((u) => [u, 0]));
  for (const p of pairs) {
    if (!p.weight || !score.has(p.a) || !score.has(p.b)) continue;
    const s = p.weight * (2 * p.agreement - 1); // net, signed for "younger"
    score.set(p.younger, score.get(p.younger) + s); score.set(p.older, score.get(p.older) - s);
    took.set(p.a, took.get(p.a) + p.weight); took.set(p.b, took.get(p.b) + p.weight);
  }
  const meanElev = (u) => { const s = elevSum.get(u); return s && s[1] ? s[0] / s[1] : null; };
  const info = strat.map((u) => {
    const t = took.get(u);
    return { unit: u, norm: t ? score.get(u) / t : null, elev: meanElev(u), area: units.get(u).area };
  });
  info.sort((x, y) => {
    if (x.norm != null && y.norm != null && Math.abs(x.norm - y.norm) > 0.05) return y.norm - x.norm;
    if (x.norm != null && y.norm == null) return -1;
    if (y.norm != null && x.norm == null) return 1;
    if (x.elev != null && y.elev != null) return y.elev - x.elev;
    return y.area - x.area;
  });
  const order = info.map((i) => i.unit);
  const unitsOut = [...units.entries()].map(([u, e]) => {
    const i = info.find((x) => x.unit === u);
    return { unit: u, description: e.desc, role: roles[u], areaKm2: e.area / 1e6, score: i?.norm ?? null, meanElevation: meanElev(u), evidence: i?.norm != null ? "bedding" : meanElev(u) != null ? "elevation" : roles[u] === "stratigraphic" ? "area" : "role" };
  });
  return { order, roles, pairs, units: unitsOut };
}
