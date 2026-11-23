// TASKS.csv #4031 (guided modelling row 1, design docs/ideas/guided-modelling-design.md section 1) — the guide's seven steps. Each reads
// guideFacts() and the guide's saved place (#4032: { route, skipped, at }; the card may add ui: { modelResolution }) and says:
//   state:  "done" (read from the project, never a stored tick), "next" (can be done now), "waiting" (needs data or an earlier step), "skipped";
//   reason: one line, the numbers in it;
//   asks:   the step's one question and its suggestion, and the rows it offers, each with an `act` key the card turns into a door
//           (a pane opened with its intent, #4033, or a run); `act`s here are names, nothing runs from this file.
// title and line are English tr() keys (translated where they are drawn, as guidedTools.js does); every reason is tr()'d here, at call time.
import { t as tr } from "../i18n.js";
import { suggestRoute } from "./suggestRoute.js";
import { MIN_HOLES, SET_PER_HOLE } from "./guideFacts.js";
import { QUICK_RESOLUTION } from "../auto/autoSurface.js";
import { axisResolution, blockCellsM } from "../modelResolution.js";
import { GEMPY_MAX_SURFACES } from "../gempyLimits.js";

const r0 = (v) => Math.round(v);
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${r0(m)} m`);
// cells across at a resolution, from the collars' box (guideFacts area.extent)
export function cellsAt(facts, n) {
  const e = facts.area.extent;
  if (!e) return null;
  const c = blockCellsM(e, axisResolution(e, n));
  return Math.max(c[0], c[1]);
}
const groupsOf = (f) => f.area.clusters.filter((c) => c.n >= MIN_HOLES);
const evidenceOf = (fl) => fl.picks + fl.logged + fl.outcrop + fl.mapped + fl.drawn + fl.sectionStrings;
const veinsToBuild = (f) => f.veins.filter((v) => v.holes >= MIN_HOLES && v.perHole <= SET_PER_HOLE);
const veinKey = (k) => (k.startsWith("litho:") ? k.slice(6) : k);
const mapOnly = (f) => f.contacts.holes < MIN_HOLES && f.map.polygons > 0;

const DATA = {
  id: "data", title: "Your data", line: "What your data can build.",
  status(f) {
    const rows = [];
    if (f.logged.holes) rows.push({ key: "logs", text: tr("Logged holes: {n}", { n: f.logged.holes }) });
    if (f.picks.oriented) rows.push({ key: "picks", text: tr("Oriented picks: {n}", { n: f.picks.oriented }) });
    if (f.assays.rows) rows.push({ key: "assays", text: tr("Assays: {n}", { n: f.assays.rows }) });
    if (f.map.polygons) rows.push({ key: "map", text: tr("Map units: {n}", { n: f.map.units }) });
    if (f.drawn.sectionContacts) rows.push({ key: "drawn", text: tr("Drawn contacts: {n}", { n: f.drawn.sectionContacts }) });
    rows.push({ key: "terrain", text: f.terrain ? tr("Terrain: yes") : tr("No terrain yet."), act: f.terrain ? null : "terrain" });
    const base = f.contacts.holes >= MIN_HOLES || f.map.polygons > 0 || f.assays.rows > 0;
    return { state: base ? "done" : "waiting", reason: base ? null : tr("Add logs, a map or assays first."), asks: { rows, act: base ? "qc" : "add-data" } };
  },
};

const AREA = {
  id: "area", title: "Area and detail", line: "Where, and how fine.", question: "Whole property, or one group?",
  status(f, g) {
    if (mapOnly(f)) return { state: "skipped", reason: tr("Not needed for this data."), asks: null };
    if (f.contacts.holes < MIN_HOLES) return { state: "skipped", reason: tr("Not needed for this data."), asks: null }; // assays alone: the Grade model sizes itself
    if (f.positioned < MIN_HOLES || !(f.area.spacing > 0)) return { state: "waiting", reason: tr("Needs three holes with positions."), asks: null };
    const sp = f.area.spacing, groups = groupsOf(f), n = g?.ui?.modelResolution || QUICK_RESOLUTION;
    const cell = cellsAt(f, n), coarse = cell > 1.5 * (sp / 2);
    const multi = groups.length > 1 && groups[0].n < f.positioned;
    const suggest = multi || cellsAt(f, QUICK_RESOLUTION) > 1.5 * (sp / 2) ? "group" : "whole";
    const reason = multi ? tr("{g} groups of holes, {d} apart: start with {n} holes.", { g: groups.length, d: km(f.area.gapM), n: groups[0].n })
      : coarse ? tr("Cells of {x} m for holes {s} m apart: model less area.", { x: r0(cell), s: r0(sp) })
      : tr("Cells of {x} m suit holes {s} m apart.", { x: r0(cell), s: r0(sp) });
    const group = groups[0] ? { ids: groups[0].ids, n: groups[0].n } : null;
    return { state: coarse ? "next" : "done", reason, asks: { question: AREA.question, suggest, group, resolution: QUICK_RESOLUTION, act: "settings", terrain: f.terrain ? null : "terrain" } };
  },
};

const ROCKS = {
  id: "rocks", title: "Rocks and order", line: "Which rocks, in which order.",
  status(f) {
    if (mapOnly(f)) return { state: "skipped", reason: tr("Not needed for this data."), asks: null };
    if (f.contacts.holes < MIN_HOLES) return { state: "waiting", reason: tr("Needs contacts in three logged holes."), asks: null };
    const rows = [], st = f.stack, plan = st.plan;
    if (f.cover && f.cover.of >= MIN_HOLES) rows.push({ key: "cover", unit: f.cover.unit, act: "role-overburden", text: tr("{code} starts {n} of {h} holes: the cover.", { code: f.cover.unit, n: f.cover.starts, h: f.cover.of }) });
    const b = f.body;
    if (b && b.holes >= MIN_HOLES && b.inside / b.holes >= f.order.insideMax && !["dyke", "vein", "breccia", "intrusion", "cross-cutting", "overburden"].includes(b.role)) {
      rows.push({ key: "cutting", unit: b.unit, act: "role-intrusion", text: tr("{code} lies inside another rock in {n} of {h} holes.", { code: b.unit, n: b.inside, h: b.holes }) });
    }
    if (f.thinCodes.length) rows.push({ key: "thin", codes: f.thinCodes, act: "leave-out", text: tr("Rare codes (under 1 %): {n}", { n: f.thinCodes.length }) });
    if (st.units.length < 2) {
      if (f.order.addable >= 2) rows.push({ key: "add", act: "add-all", text: tr("Add the {n} rocks in the holes' order.", { n: f.order.addable }) });
    } else if (plan && plan.moves) rows.push({ key: "sort", act: "sort", text: tr("Out of the holes' order: {n}", { n: plan.moves }) });
    for (const c of (plan?.contradictions || []).filter((x) => x.kind === "split").slice(0, 2)) {
      rows.push({ key: "split", units: c.units, act: "section", text: tr("{a} above {b} in {x} of {t} holes.", { a: c.units[0], b: c.units[1], x: c.aAbove, t: c.of }) /* of: three or more (holesOrderPlan) */ });
    }
    if (st.over) rows.push({ key: "over", act: "cut", text: tr("Rocks over the engine's {max}: {n}", { n: st.units.length - GEMPY_MAX_SURFACES, max: GEMPY_MAX_SURFACES }) });
    if (f.order.steady.length < 2) return { state: "done", reason: tr("These rocks do not stack: build bodies (step 4)."), asks: { rows, act: "mcodes" } };
    const done = st.units.length >= 2 && !(plan && plan.moves) && !st.over;
    return { state: done ? "done" : "next", reason: null, asks: { rows, act: "stack" } };
  },
};

const BUILD = {
  id: "build", title: "Compute or draw", line: "Computed between the holes, or drawn.", question: "Compute or draw?",
  status(f, g) {
    const s = suggestRoute(f), route = g?.route || s.route;
    if (!route) return { state: "waiting", reason: s.reason, asks: null };
    const st = f.stack, asks = { question: BUILD.question, suggest: s, route, act: route === "map" ? "mapmodel" : route === "drawn" ? "explicit" : "stack" };
    if (route === "map") return { state: f.built.strat >= 1 ? "done" : "next", reason: s.route === "map" ? s.reason : null, asks };
    if (route === "computed" && s.why !== "body" && st.units.length < 2) return { state: "waiting", reason: tr("Stack two rocks first (step 3)."), asks };
    // the first (youngest) unit has no surface of its own (its top is the ground or the cover): every unit under it has its top (#4035, live)
    const under = st.units.slice(1), stackDone = under.length >= 1 && under.every((u) => st.built.includes(u));
    const done = route === "drawn" ? (st.units.length >= 2 ? stackDone : f.drawn.explicitBuilt >= 1) : s.why === "body" && st.units.length < 2 ? f.built.bodies >= 1 : stackDone;
    return { state: done ? "done" : "next", reason: done ? null : s.route === route ? s.reason : null, asks };
  },
};

const FAULTS = {
  id: "faults", title: "Faults and veins", line: "Faults, veins and dykes.", question: "Faults in this model?",
  status(f) {
    const fl = f.faults, ev = evidenceOf(fl), veins = veinsToBuild(f);
    const parts = [];
    if (fl.picks + fl.outcrop) parts.push(tr("Fault picks: {n}", { n: fl.picks + fl.outcrop })); // in holes and at outcrop
    if (fl.logged) parts.push(tr("Logged fault zones: {n}", { n: fl.logged }));
    if (fl.mapped + fl.drawn + fl.sectionStrings) parts.push(tr("Fault lines: {n}", { n: fl.mapped + fl.drawn + fl.sectionStrings })); // mapped, drawn, on sections
    const rows = veins.map((v) => ({ key: "vein", vein: v.key, act: "vein", done: f.veinBuilt.has(veinKey(v.key)), text: tr("{code}: in {n} holes.", { code: veinKey(v.key), n: v.holes }) }));
    if (!ev && !veins.length) return { state: "done", reason: tr("No fault or vein evidence."), asks: { question: FAULTS.question, suggest: "no", act: "draw-fault", rows } };
    const done = (!ev || fl.surfaces >= 1) && rows.every((r) => r.done);
    return { state: done ? "done" : "next", reason: ev ? parts.join("; ") : tr("No fault evidence: skip faults."), asks: { question: FAULTS.question, suggest: ev ? "yes" : "no", act: ev ? "faults" : "draw-fault", rows, stack: fl.surfaces >= 1 && !fl.inStack ? "stack-faults" : null } };
  },
};

const GRADE = {
  id: "grade", title: "Volumes and grade", line: "Solids and grade.",
  status(f) {
    const b = f.built, rows = [];
    if (b.strat + b.bodies + b.explicit >= 1) rows.push({ key: "blocks", act: "result-block", done: b.blocks >= 1 });
    if (f.alteration) rows.push({ key: "halo", act: "alteration", done: b.halos >= 1 });
    if (f.assays.rows) rows.push({ key: "grade", act: "grade", done: b.shells >= 1 });
    if (!rows.length) return { state: "waiting", reason: tr("Needs a model, alteration logs or assays."), asks: null };
    return { state: rows.every((r) => r.done) ? "done" : "next", reason: null, asks: { rows } };
  },
};

const CHECK = {
  id: "check", title: "Check it", line: "Compare, then share.",
  status(f) {
    const b = f.built, any = b.strat + b.faults + b.veins + b.explicit + b.shells + b.halos + b.bodies + b.blocks;
    return any ? { state: "next", reason: null, asks: { act: "section" } } : { state: "waiting", reason: tr("Build something first."), asks: null };
  },
};

export const GUIDE_STEPS = [DATA, AREA, ROCKS, BUILD, FAULTS, GRADE, CHECK];
export const guideStepById = (id) => GUIDE_STEPS.find((s) => s.id === id) || null;

// every step's status, a skipped step (the guide's own list) shown as skipped unless it is done; and the step to open on: the first that can be
// done now, else the first waiting one (Model > Start here reopens there)
export function guideStatus(facts, guide = {}) {
  const skipped = new Set(guide?.skipped || []);
  const list = GUIDE_STEPS.map((s) => {
    const st = s.status(facts, guide);
    return { id: s.id, ...st, state: st.state !== "done" && skipped.has(s.id) ? "skipped" : st.state };
  });
  const at = list.find((x) => x.state === "next") || list.find((x) => x.state === "waiting") || list[list.length - 1]; // Macpass (assays only): step 6
  return { steps: list, at: at.id };
}
