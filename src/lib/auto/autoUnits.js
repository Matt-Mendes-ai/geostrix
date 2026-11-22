// TASKS.csv #3908 (the guided tools, batch P7a) — the one question each guided tool asks, answered from the logs first: which units stack
// as layers, which logged code is the cover, which rock forms bodies. Pure; reads the lithology rows only ({ hole_id, from, to, value }),
// never a deposit style or a list of "usual" rock names, except the plain cover words below as a hint beside where the code sits.
import { thin } from "./autoCommon.js";
import { t as tr, fmtNum } from "../i18n.js";

const MIN_HOLES = 3;
// layered: the unit sits in the same order against the others in at least AGREE_MIN of the holes that cut both, and lies inside another
// rock (the same rock above and below it) in fewer than INSIDE_MAX of its holes. A rock inside another cuts it: a body, a dyke, a sill.
// (Counting repeats would not do: a host rock split by a dyke repeats too.)
export const AGREE_MIN = 0.8, INSIDE_MAX = 0.3;
// words a logger uses for cover or weathering; a hint only, beside the code sitting at the top of the holes
const COVER_WORDS = /\b(ov(?:e)?b|ob|overburden|till|cover|cas(?:ing)?|sapro\w*|later\w*|oxid\w*|regol\w*|alluv\w*|colluv\w*|soil|sand|gravel|clay|weather\w*|glacia\w*|duricrust|ferricrete|tertiary|quaternary|qal|qt)\b/i;

// per hole: its runs of one unit, top down
function runsByHole(rows) {
  const by = new Map();
  for (const r of thin(rows, 200000)) {
    const from = Number(r.from), to = Number(r.to);
    if (r.value == null || r.value === "" || !Number.isFinite(from)) continue;
    if (!by.has(r.hole_id)) by.set(r.hole_id, []);
    by.get(r.hole_id).push({ unit: String(r.value), from, to: Number.isFinite(to) ? to : from });
  }
  const out = new Map();
  for (const [h, list] of by) {
    list.sort((a, b) => a.from - b.from);
    const runs = [];
    for (const r of list) { const last = runs[runs.length - 1]; if (last && last.unit === r.unit) last.to = Math.max(last.to, r.to); else runs.push({ ...r }); }
    out.set(h, runs);
  }
  return out;
}

// -> { units: [{ unit, holes, inside }] (most holes first), order: [unit] (layered, top first), bodies: [unit], agree: Map unit -> share }
export function stackOrder(rows) {
  const holes = runsByHole(rows), units = new Map(), above = new Map();
  const key = (a, b) => `${a}\u0001${b}`;
  for (const runs of holes.values()) {
    const first = new Map(), inside = new Set();
    runs.forEach((r, i) => { if (!first.has(r.unit)) first.set(r.unit, r.from); if (i > 0 && i < runs.length - 1 && runs[i - 1].unit === runs[i + 1].unit) inside.add(r.unit); });
    for (const u of first.keys()) { const s = units.get(u) || { unit: u, holes: 0, inside: 0 }; s.holes++; if (inside.has(u)) s.inside++; units.set(u, s); }
    const us = [...first.keys()];
    for (const a of us) for (const b of us) if (a !== b && first.get(a) < first.get(b)) above.set(key(a, b), (above.get(key(a, b)) || 0) + 1);
  }
  const list = [...units.values()].sort((a, b) => b.holes - a.holes || a.unit.localeCompare(b.unit));
  const cands = list.filter((u) => u.holes >= MIN_HOLES).map((u) => u.unit);
  const ab = (a, b) => above.get(key(a, b)) || 0;
  const score = (a) => cands.reduce((s, b) => s + ab(a, b) - ab(b, a), 0);
  const ranked = [...cands].sort((a, b) => score(b) - score(a));
  // then the head-to-head majority wins between neighbours: a unit cut by more holes beats more units in all, but must not outrank the
  // one logged above it in most holes that have both (the stack run checks exactly this and asks before it runs out of order)
  for (let pass = 0, moved = true; moved && pass < ranked.length; pass++) {
    moved = false;
    for (let i = 0; i + 1 < ranked.length; i++) if (ab(ranked[i + 1], ranked[i]) > ab(ranked[i], ranked[i + 1])) { [ranked[i], ranked[i + 1]] = [ranked[i + 1], ranked[i]]; moved = true; }
  }
  const agree = new Map();
  for (const a of ranked) {
    let ok = 0, all = 0;
    for (const b of ranked) { if (a === b) continue; const n = ab(a, b) + ab(b, a); if (!n) continue; all += n; ok += ranked.indexOf(a) < ranked.indexOf(b) ? ab(a, b) : ab(b, a); }
    agree.set(a, all ? ok / all : 0);
  }
  const layered = (u) => agree.get(u) >= AGREE_MIN && units.get(u).inside / units.get(u).holes < INSIDE_MAX;
  return { units: list, order: ranked.filter(layered), bodies: ranked.filter((u) => !layered(u)), agree, holeCount: holes.size };
}

// TASKS.csv #3997 — why a cover code cannot be modelled by its top, and the route that works: c is collarCover() (lib/modellingCodes.js).
// stack: also say that, as Overburden, its base is one eroding surface over the rocks it rests on (the stack folds it in, #1684).
export function coverAdvice(unit, c, { stack = false } = {}) {
  const s = tr("{unit} starts {n} of the {h} holes at the collar: it is the cover. Its top there is the ground, not a contact, so a surface from its other tops is not its top (it sits off to one side). Model its base instead: Model > Cover and weathering, or set its role to Overburden in Modelling codes.", { unit, n: c.starts, h: c.holes });
  return stack && c.onto.length > 1 ? s + tr(" As Overburden, its base is one eroding surface over the rocks it rests on ({list}), and the stack is modelled under it.", { list: c.onto.slice(0, 6).join(", ") }) : s;
}

// the cover: the code that starts the most holes, and reads like cover. describe(code) -> the code's description, if the project has one
export function suggestCover(rows, describe = () => "") {
  const holes = runsByHole(rows);
  if (!holes.size) return null;
  const starts = new Map();
  for (const runs of holes.values()) { const u = runs[0].unit; starts.set(u, (starts.get(u) || 0) + 1); }
  let best = null;
  for (const [unit, n] of starts) {
    const share = n / holes.size, words = COVER_WORDS.test(`${unit} ${describe(unit) || ""}`);
    const score = share + (words ? 0.5 : 0);
    if ((share >= 0.5 || (words && share >= 0.2)) && (!best || score > best.score)) best = { unit, share, words, score };
  }
  if (!best) return null;
  const p = fmtNum(100 * best.share, { maximumFractionDigits: 0 });
  return { unit: best.unit, reason: best.words
    ? tr("{unit} starts {p} % of the holes and its name or description reads like cover or weathering.", { unit: best.unit, p })
    : tr("{unit} starts {p} % of the holes: the top of the drilled column.", { unit: best.unit, p }) };
}

// a rock that forms bodies: one the layers' order leaves out (it lies inside another rock, or sits in no steady order), cut by the most holes.
// prefer(unit): the modelling engine reads it as cross-cutting (TASKS.csv #3908), so those come first
export function suggestBody(rows, prefer = () => false) {
  const s = stackOrder(rows), byUnit = new Map(s.units.map((u) => [u.unit, u]));
  const unit = s.bodies.find(prefer) ?? s.bodies[0] ?? null;
  if (!unit) return null;
  const u = byUnit.get(unit);
  return { unit, reason: u.inside / u.holes >= INSIDE_MAX
    ? tr("{unit} lies inside another rock (the same rock above and below it) in {n} of its {h} holes: it cuts the other rocks rather than lying between them.", { unit, n: u.inside, h: u.holes })
    : tr("{unit} sits in no steady order against the other rocks: it cuts them rather than lying between them.", { unit }) };
}
