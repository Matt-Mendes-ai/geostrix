// TASKS.csv #3962 (P2) — a suggested drill program (Review data\Drill planner\design.md, sections 1.3-1.5; Matt's answers 2026-11-22: pads
// first, Balanced by default, per-hole metal only). Pure; run in the worker (drillPlanner.worker.js, kind "program").
//
//  - Pads: the drilled collars grouped within 10 m (planChecks' pad), plus pads the user adds (new: they carry the per-pad cost).
//  - Candidates: from each ticked pad, every azimuth step and dip; as long as the target needs plus 30 m (or the longest hole the rig
//    drills). With a target volume, a candidate must cross it for the minimum length, and only its composites inside it count.
//  - Rules, each per dollar (per metre when no drilling rate is set):
//      hit       the chance of an intercept, P(hit);
//      metal     the expected grade x metres of the hole's best intercept (the mean over the runs, a miss counting 0);
//      learn     the hole's own kriging variance summed down it (normal scores): the ground it would resolve. It depends only on where
//                the hole goes, never on a grade;
//      balanced  the middle (P50) grade x metres plus kappa x its spread (P90 - P10): near known grade at 0, into the unknown as kappa grows.
//  - Greedy, "as if drilled": the best score is taken, its composites are added to the data at their predicted mean (the kriging
//    believer of batch Bayesian optimization: the mean does not move, the variance near it drops), and the candidates near it are scored
//    again; until a limit (holes, metres, budget, holes per pad) or no candidate is left. A candidate whose composites mostly lie within the
//    minimum spacing of a drilled or chosen hole is a twin and is skipped.
//  - The diminishing-returns line: under the last hole that still scores at least a quarter of the first.
// "Suggested", never "optimal": greedy selection is a sound heuristic, and the rule is the geologist's choice.
import { predictHole, holePosterior, DEFAULTS } from "./holePrediction.js";
import { plannedTrace } from "../plannedTrace.js";

export const RULES = ["balanced", "hit", "metal", "learn"];
export const PROGRAM_DEFAULTS = { azStep: 45, dips: [-50, -65, -80], maxLength: 250, pastTargetM: 30, maxHoles: 10, perPad: 3, kappa: 0.5, runs: 40, screenData: 200, lineShare: 0.25, padM: 10, maxCandidates: 2000 };

// drilled collars [{ hole_id, x, y, z }] -> pads [{ id, x, y, z, holes, isNew: false }]: a collar within padM of a pad's centre joins it
export function padsFromCollars(collars, padM = PROGRAM_DEFAULTS.padM) {
  const pads = [];
  for (const c of collars || []) {
    const x = Number(c.x), y = Number(c.y), z = Number(c.z);
    if (![x, y, z].every(Number.isFinite)) continue;
    const p = pads.find((q) => Math.hypot(q.x - x, q.y - y) <= padM);
    if (p) { p.holes.push(String(c.hole_id)); const n = p.holes.length; p.x += (x - p.x) / n; p.y += (y - p.y) / n; p.z += (z - p.z) / n; }
    else pads.push({ id: `pad:${pads.length + 1}`, x, y, z, holes: [String(c.hole_id)], isNew: false });
  }
  return pads;
}

// merged [from, to] runs of a trace inside a volume, from meshQuery's intervalsInsideMesh rows
export function insideRuns(rows) {
  const out = [];
  for (const r of rows || []) if (r.inside) { const last = out[out.length - 1]; if (last && r.from - last[1] < 1e-6) last[1] = r.to; else out.push([r.from, r.to]); }
  return out;
}

// pads x azimuths x dips -> candidates { id, pad, x, y, z, azimuth, dip, length, trace, inside }. insideOf(trace) -> [[from, to]] (a
// target volume) or null for none. -> { candidates, outside: how many never reach the target for the minimum length, capped }
export function candidateHoles(pads, { azimuths, dips, maxLength = PROGRAM_DEFAULTS.maxLength, minLength = 0, insideOf = null, pastTargetM = PROGRAM_DEFAULTS.pastTargetM, maxCandidates = PROGRAM_DEFAULTS.maxCandidates } = {}) {
  const candidates = [];
  let outside = 0;
  for (const p of pads) for (const azimuth of azimuths) for (const dip of dips) {
    const hole = { x: p.x, y: p.y, z: p.z, azimuth, dip, length: maxLength };
    let trace = plannedTrace(hole), inside = null, length = maxLength;
    if (insideOf) {
      inside = insideOf(trace);
      const metres = inside.reduce((t, [a, b]) => t + (b - a), 0);
      if (!inside.length || metres < Math.max(minLength, 1e-6)) { outside++; continue; }
      length = Math.min(maxLength, Math.ceil(inside[inside.length - 1][1] + pastTargetM));
      trace = plannedTrace({ ...hole, length });
      inside = inside.map(([a, b]) => [a, Math.min(b, length)]).filter(([a, b]) => b > a);
    }
    candidates.push({ id: `${p.id}|${azimuth}|${dip}`, pad: p.id, x: p.x, y: p.y, z: p.z, azimuth, dip, length, trace: trace.map((q) => ({ md: q.md, x: q.x, y: q.y, z: q.z })), inside });
  }
  return { candidates: candidates.slice(0, maxCandidates), outside, capped: candidates.length > maxCandidates, total: candidates.length };
}

// a hole's cost: metres x the type's rate (else the default rate), the per-hole cost, and the per-pad cost the first time a NEW pad is used.
// money: false when no rate applies (the score is then per metre).
export function holeCost(c, rates, { type = "", padIsNew = false, padUsed = false } = {}) {
  const rate = Number(rates?.[type]) > 0 ? Number(rates[type]) : Number(rates?.[""]) > 0 ? Number(rates[""]) : null;
  if (rate == null) return { cost: c.length, money: false };
  const perHole = Number(rates?.__perHole) > 0 ? Number(rates.__perHole) : 0, perPad = Number(rates?.__perPad) > 0 ? Number(rates.__perPad) : 0;
  return { cost: c.length * rate + perHole + (padIsNew && !padUsed ? perPad : 0), money: true };
}

// a rule's value from a prediction
export function ruleValue(rule, pred, kappa = PROGRAM_DEFAULTS.kappa) {
  if (!pred || pred.beyond) return 0;
  if (rule === "hit") return pred.pHit;
  if (rule === "metal") return pred.gtMean;
  if (rule === "learn") return pred.varM;
  return pred.gt[1] + kappa * (pred.gt[2] - pred.gt[0]);
}

// real-coordinate points (drilled composites and chosen holes) for the twin test and the "nearest hole" of the Why sentence
function pointIndex(cell) {
  const map = new Map(), key = (i, j, l) => `${i},${j},${l}`, xs = [], ys = [], zs = [], ids = [];
  return {
    add(x, y, z, id) { const n = xs.length; xs.push(x); ys.push(y); zs.push(z); ids.push(id); const k = key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)); (map.get(k) || map.set(k, []).get(k)).push(n); },
    nearest(x, y, z, R) {
      let best = null, bd = R * R; const r = Math.ceil(R / cell), ci = Math.floor(x / cell), cj = Math.floor(y / cell), cl = Math.floor(z / cell);
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let l = cl - r; l <= cl + r; l++) {
        const b = map.get(key(i, j, l)); if (!b) continue;
        for (const q of b) { const d = (xs[q] - x) ** 2 + (ys[q] - y) ** 2 + (zs[q] - z) ** 2; if (d <= bd) { bd = d; best = q; } }
      }
      return best == null ? null : { id: ids[best], d: Math.sqrt(bd) };
    },
  };
}

// a candidate's composite centres (real coordinates), only those inside the target when it has one
function centres(c, step) {
  const out = [], L = c.trace[c.trace.length - 1].md;
  for (let a = 0; a + step <= L + 1e-6; a += step) {
    const md = a + step / 2;
    if (c.inside && !c.inside.some(([lo, hi]) => md >= lo && md <= hi)) continue;
    let i = 0; while (i < c.trace.length - 2 && c.trace[i + 1].md < md) i++;
    const p = c.trace[i], q = c.trace[i + 1], t = q.md > p.md ? (md - p.md) / (q.md - p.md) : 0;
    out.push({ md, x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });
  }
  return out;
}

// the model with a chosen hole's composites added at their predicted mean (normal scores): the "as if drilled" update
function believe(model, c, opts) {
  const post = holePosterior(model, c.trace, opts);
  if (!post.m) return model;
  const d = model.data, n = d.x.length, m = post.m;
  const grow = (a, add) => { const out = new Float64Array(n + m); out.set(a); for (let j = 0; j < m; j++) out[n + j] = add(j); return out; };
  return { ...model, _idx: undefined, _back: model._back,
    data: { x: grow(d.x, (j) => post.pts[j][0]), y: grow(d.y, (j) => post.pts[j][1]), z: grow(d.z, (j) => post.pts[j][2]), ns: grow(d.ns, (j) => post.mean[j]) },
    ids: [...(model.ids || []), ...Array(m).fill(`#${c.id}`)] };
}

// The program. opts: { rule, kappa, step, searchRadius, runs, minSpacing, limits: { maxHoles, maxMetres, budget, perPad }, pads (id -> { isNew }),
// rates, type, lineShare, drilled: { x, y, z, ids } (the composites, real coordinates), onProgress }
// -> { chosen: [{ order, id, pad, x, y, z, azimuth, dip, length, inside, value, cost, score, cumCost, cumMetres, money, facts }], line, counts }
export function selectProgram(model0, candidates, rules, opts = {}) {
  const rule = RULES.includes(opts.rule) ? opts.rule : "balanced", kappa = opts.kappa ?? PROGRAM_DEFAULTS.kappa;
  const step = opts.step || DEFAULTS.step, runs = opts.runs || PROGRAM_DEFAULTS.runs, minSpacing = opts.minSpacing > 0 ? opts.minSpacing : 0;
  const lim = { maxHoles: PROGRAM_DEFAULTS.maxHoles, perPad: PROGRAM_DEFAULTS.perPad, ...(opts.limits || {}) };
  const searchRadius = opts.searchRadius || model0.vg.range;
  // screening: 40 runs on the nearest 200 composites (the table's numbers are the 200-run predictions from all of them, made after)
  const pOpts = (c) => ({ step, searchRadius, realizations: runs, inside: c.inside, maxData: PROGRAM_DEFAULTS.screenData });
  const near = pointIndex(Math.max(5, minSpacing || 10)), drilledNear = pointIndex(50); // drilled and chosen (the twin test); drilled only (Why)
  const d = opts.drilled;
  if (d) for (let i = 0; i < d.x.length; i++) { near.add(d.x[i], d.y[i], d.z[i], d.ids?.[i] ?? ""); drilledNear.add(d.x[i], d.y[i], d.z[i], d.ids?.[i] ?? ""); }
  const twin = (c) => { if (!minSpacing) return false; const pts = centres(c, step); if (!pts.length) return false; let k = 0; for (const p of pts) if (near.nearest(p.x, p.y, p.z, minSpacing)) k++; return k / pts.length > 0.5; };
  let model = model0;
  const state = new Map(); // id -> { pred, value } | { skip }
  const counts = { candidates: candidates.length, twins: 0, beyond: 0, scored: 0 };
  const score = (c) => {
    if (twin(c)) { counts.twins++; state.set(c.id, { skip: "twin" }); return; }
    const pred = predictHole(model, c.trace, rules, pOpts(c));
    if (pred.beyond) { counts.beyond++; state.set(c.id, { skip: "beyond" }); return; }
    counts.scored++;
    state.set(c.id, { pred, value: ruleValue(rule, pred, kappa) });
  };
  candidates.forEach((c, i) => { score(c); if (i % 20 === 0) opts.onProgress?.(0.6 * (i + 1) / candidates.length); });
  const chosen = [], perPadUsed = new Map(), usedPads = new Set();
  let cumCost = 0, cumMetres = 0;
  const reach = model0.vg.range; // in the model's frame a hole's composites move the posterior within the variogram's range of them
  const bbox = (c) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of c.trace) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { x0, x1, y0, y1 }; };
  const boxes = new Map(candidates.map((c) => [c.id, bbox(c)]));
  const maxHoles = lim.maxHoles > 0 ? lim.maxHoles : PROGRAM_DEFAULTS.maxHoles;
  // lazy greedy: a candidate near a chosen hole is only marked stale; its old score stands until it reaches the top, and is then scored
  // again (and re-ranked) before it can be taken. Far fewer predictions than scoring every neighbour after each pick (#3962 P2: 400
  // candidates took 134 s that way); exact when a pick only lowers its neighbours' values, a sound heuristic otherwise.
  while (chosen.length < maxHoles) {
    let best = null;
    for (const c of candidates) {
      const s = state.get(c.id);
      if (!s || s.skip || s.taken || !(s.value > 0)) continue;
      if (lim.perPad > 0 && (perPadUsed.get(c.pad) || 0) >= lim.perPad) continue;
      if (lim.maxMetres > 0 && cumMetres + c.length > lim.maxMetres) continue;
      const k = holeCost(c, opts.rates, { type: opts.type || "", padIsNew: !!opts.pads?.[c.pad]?.isNew, padUsed: usedPads.has(c.pad) });
      if (k.money && lim.budget > 0 && cumCost + k.cost > lim.budget) continue;
      const sc = s.value / k.cost;
      if (!best || sc > best.score) best = { c, s, k, score: sc };
    }
    if (!best) break;
    if (best.s.stale) { score(best.c); continue; }
    const { c, s, k } = best;
    s.taken = true;
    cumCost += k.cost; cumMetres += c.length;
    perPadUsed.set(c.pad, (perPadUsed.get(c.pad) || 0) + 1); usedPads.add(c.pad);
    chosen.push({ order: chosen.length + 1, id: c.id, pad: c.pad, x: c.x, y: c.y, z: c.z, azimuth: c.azimuth, dip: c.dip, length: c.length, inside: c.inside, value: s.value, cost: k.cost, money: k.money, score: best.score, cumCost, cumMetres, facts: facts(c, s.pred, drilledNear, step, model0.vg.nugget) });
    // as if drilled: its composites join the data at their predicted mean, and its centres join the twin test; the candidates near it are scored again
    model = believe(model, c, pOpts(c));
    for (const p of centres(c, step)) near.add(p.x, p.y, p.z, `#${c.id}`);
    const b = boxes.get(c.id);
    for (const o of candidates) {
      const so = state.get(o.id); if (!so || so.taken || so.skip === "beyond") continue;
      const ob = boxes.get(o.id);
      if (ob.x0 > b.x1 + reach || ob.x1 < b.x0 - reach || ob.y0 > b.y1 + reach || ob.y1 < b.y0 - reach) continue;
      if (so.skip === "twin") continue;
      so.stale = true;
    }
    opts.onProgress?.(0.6 + 0.4 * chosen.length / maxHoles);
  }
  const share = opts.lineShare ?? PROGRAM_DEFAULTS.lineShare;
  let line = chosen.length;
  if (chosen.length) { const top = chosen[0].score; line = chosen.findIndex((h) => h.score < share * top); if (line < 0) line = chosen.length; }
  return { chosen, line, counts, rule, kappa };
}

// the numbers behind a hole's "Why" sentence: the nearest drilled hole to its middle (in the target), how little the model knows there
// (the mean kriging variance of its composites, normal scores: 0 at a drilled composite, 1 where nothing is known), its P(hit)
// unknown: the mean kriging variance above the nugget, as a share of what is left above it (0 at a drilled composite, 1 where nothing is
// known): a 45 % nugget makes even a point beside a hole half "unknown", which is not what "the model knows little there" means
function facts(c, pred, near, step, nugget = 0) {
  const pts = centres(c, step);
  const mid = pts[Math.floor(pts.length / 2)] || c.trace[c.trace.length - 1];
  let n = null;
  for (const R of [50, 150, 500, 2000]) { n = near.nearest(mid.x, mid.y, mid.z, R); if (n) break; }
  const inReach = pred.band?.md?.length || 0;
  const meanVar = inReach ? pred.varM / (inReach * step) : null;
  return { nearestHole: n ? n.id : null, nearestM: n ? Math.round(n.d) : null, meanVar, unknown: meanVar == null ? null : Math.max(0, Math.min(1, (meanVar - nugget) / Math.max(1e-9, 1 - nugget))), pHit: pred.pHit, midMd: mid.md };
}
