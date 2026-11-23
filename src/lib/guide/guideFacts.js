// TASKS.csv #4031 (guided modelling row 1, design docs/ideas/guided-modelling-design.md) — what the project holds, read once for the guide's seven
// steps: counts and the few judgments each step's line and question need (the layers' order, the cover, a rock that cuts the others, the drill
// spacing). Pure: no React, no three.js, no desurvey, no sidecar, no network, no Data QC. One pass over each table it reads (a test counts the row
// reads on a 200,000-row log), memoized on the store's references: the card asks again on every render and gets the same object back until the
// project changes. The per-hole runs are built here and handed to autoUnits (stackOrder / suggestCover / suggestBody), which would each read the
// log again otherwise.
import { stackOrder, suggestCover, suggestBody, AGREE_MIN, INSIDE_MAX } from "../auto/autoUnits.js";
import { siteSpacing } from "../auto/autoCommon.js";
import { QUICK_RESOLUTION } from "../auto/autoSurface.js";
import { axisResolution, blockCellsM } from "../modelResolution.js";
import { holeClusters } from "../holeClusters.js";
import { holesOrderPlan } from "../holesOrder.js";
import { DEFAULT_MIN_PCT, leftOutWhy } from "../stackAddAll.js";
import { GEMPY_MAX_SURFACES } from "../gempyLimits.js";
import { leftOutNames } from "../modellingCodes.js";
import { roleForLithology, faultLikeName } from "../layers.js";
import { isFaultCode, mappedFaultFeatures, drawnFaultLines } from "../faultInventory.js";

// the roles the Veins card takes from the lithology log (guidedTools.js veinChoices: BODY_ROLES less breccia) and its vein-set bar
const VEIN_ROLES = new Set(["dyke", "vein", "intrusion", "cross-cutting"]);
export const SET_PER_HOLE = 3;
export const MIN_HOLES = 3; // autoSurface: a surface needs contacts in three or more holes
export const BROAD_HOLES = 6; // autoSurface: under six, "a broad guess"

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);

// the store's references the facts depend on (the memo's key)
const KEYS = ["collars", "survey", "layers", "assays", "assayElements", "mapLayers", "terrain", "sections", "explicitSurfaces", "generatedSurfaces", "stratStack", "modellingCodes", "lithoGroups", "surfaceStructures", "voxelModels"];
let memo = null;

export function guideFacts(store) {
  const s = store || {};
  if (memo && KEYS.every((k) => memo.refs[k] === s[k])) return memo.facts;
  const facts = readFacts(s);
  memo = { refs: Object.fromEntries(KEYS.map((k) => [k, s[k]])), facts };
  return facts;
}
export const clearGuideFacts = () => { memo = null; }; // tests

function readFacts(s) {
  const layers = s.layers || {}, mc = s.modellingCodes || null, groups = arr(s.lithoGroups);
  const stack = s.stratStack || {}, stackUnits = arr(stack.units);
  const mcByName = new Map(arr(mc?.codes).map((c) => [c.name, c]));
  const roleCache = new Map();
  const roleOf = (v) => { let r = roleCache.get(v); if (r === undefined) { r = mcByName.get(v)?.role || roleForLithology(v); roleCache.set(v, r); } return r; };
  const groupOfCode = new Map();
  for (const g of groups) for (const c of arr(g.codes)) if (!groupOfCode.has(c)) groupOfCode.set(c, g);
  const assign = mc?.assign && Object.keys(mc.assign).length ? mc.assign : null;

  // ---- collars: positions, depths
  const collars = arr(s.collars);
  let holes = 0, positioned = 0;
  const pts = []; // { hole_id, x, y }: siteSpacing and holeClusters take these, so the collars are read once
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zTop = -Infinity, zBot = Infinity;
  for (const c of collars) {
    if (!c || c.hole_id == null || c.hole_id === "") continue;
    holes++;
    const x = Number(c.x), y = Number(c.y), z = Number(c.z), len = Number(c.length);
    if (!fin(x) || !fin(y)) continue;
    positioned++; pts.push({ hole_id: c.hole_id, x, y });
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (fin(z)) { if (z > zTop) zTop = z; if (fin(len) && len > 0 && z - len < zBot) zBot = z - len; }
  }

  // ---- the lithology log: ONE pass (runs per hole, metres per code, the stack's first depths, vein codes, fault codes)
  const rows = arr(layers.litho);
  const byHole = new Map(), metres = new Map(), stackKeys = new Set(stackUnits), firstAt = stackUnits.length >= 2 ? new Map() : null;
  const veinLitho = new Map();
  let lithoRows = 0, loggedFault = 0, metresAll = 0;
  const firstSet = (h, key, d) => { let m = firstAt.get(h); if (!m) { m = new Map(); firstAt.set(h, m); } const p = m.get(key); if (p === undefined || d < p) m.set(key, d); };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const h = r.hole_id, v = r.value, f = Number(r.from), tRaw = r.to, t = Number(tRaw);
    lithoRows++;
    if (v == null || v === "" || !fin(f)) continue;
    const code = String(v), to = fin(t) ? t : f;
    let list = byHole.get(h); if (!list) { list = []; byHole.set(h, list); }
    list.push({ unit: code, from: f, to });
    if (to > f) { const e = metres.get(code) || { metres: 0, holes: new Set() }; e.metres += to - f; e.holes.add(h); metres.set(code, e); metresAll += to - f; }
    if (tRaw != null && isFaultCode(code)) loggedFault++;
    const role = roleOf(code);
    if (VEIN_ROLES.has(role)) { const k = `litho:${code}`, e = veinLitho.get(k) || { holes: new Set(), rows: 0 }; e.holes.add(h); e.rows++; veinLitho.set(k, e); }
    if (firstAt) {
      if (stackKeys.has(code)) firstSet(h, code, f);
      const g = groupOfCode.get(code);
      if (g && stackKeys.has(`group:${g.id}`)) firstSet(h, `group:${g.id}`, f);
      if (mc) {
        const eff = (assign && assign[`${h}|${f.toFixed(3)}|${to.toFixed(3)}`]) || g?.name || code;
        if (stackKeys.has(`mcode:${eff}`)) firstSet(h, `mcode:${eff}`, f);
      }
    }
  }
  // runs, top down, one unit per run (autoUnits' runsByHole, from the rows just read)
  const runs = new Map();
  let contactHoles = 0;
  for (const [h, list] of byHole) {
    list.sort((a, b) => a.from - b.from);
    const out = [];
    for (const q of list) { const last = out[out.length - 1]; if (last && last.unit === q.unit) last.to = Math.max(last.to, q.to); else out.push({ ...q }); }
    runs.set(h, out);
    if (out.length >= 2) contactHoles++;
  }
  const order = stackOrder(rows, runs);
  const unitInfo = new Map(order.units.map((u) => [u.unit, u]));
  const cands = order.units.filter((u) => u.holes >= MIN_HOLES).length;
  let coverStarts = 0;
  const cover = suggestCover(rows, () => "", runs);
  if (cover) for (const list of runs.values()) if (list[0]?.unit === cover.unit) coverStarts++;
  // steady: in the same order against the others in AGREE_MIN of the holes (the order test alone). A layered unit (autoUnits) must also not lie
  // inside another rock in INSIDE_MAX of its holes, which interbedded sediments do (Century's shales and siltstones, a palaeochannel's sands):
  // they still stack, so the route counts them as steady and the Strat. stack is the tool for them
  // (a rock the stack does not take, by its role, is not counted: cover and casing, faults, dykes, breccia, veins, a left-out code)
  const steady = [...order.agree].filter(([u, a]) => a >= AGREE_MIN && u !== cover?.unit && !leftOutWhy(roleOf(u))).map(([u]) => u);
  // the rocks the stack can take (in three or more holes; not the cover, not a role the stack leaves out): what 'most rocks swap' is out of
  const eligible = order.units.filter((u) => u.holes >= MIN_HOLES && u.unit !== cover?.unit && !leftOutWhy(roleOf(u.unit))).length;
  // holes where the top of a steady unit is a contact (a run of it under another run)
  const steadySet = new Set(steady);
  let steadyContactHoles = 0;
  for (const list of runs.values()) if (list.some((q, k) => k > 0 && steadySet.has(q.unit))) steadyContactHoles++;
  const coverRole = (u) => roleOf(u) === "overburden";
  const body = order.bodies.length ? suggestBody(rows, (u) => ["dyke", "vein", "breccia", "intrusion", "cross-cutting"].includes(roleOf(u)), order) : null;
  const out = leftOutNames(mc);
  // what Add all ('at least 1 %' of the logged metres, #3999) would add to the stack: the codes it takes, by the same rules
  const inStack = new Set(stackUnits);
  const addable = [...metres].filter(([code, e]) => metresAll > 0 && e.metres >= (DEFAULT_MIN_PCT / 100) * metresAll && !inStack.has(code) && !out.has(code) && !leftOutWhy(roleOf(code))).length;
  const thinCodes = [...metres].filter(([code, e]) => metresAll > 0 && e.metres < (DEFAULT_MIN_PCT / 100) * metresAll && !out.has(code) && !leftOutWhy(roleOf(code))).map(([code]) => code);

  // ---- the stack against the holes (#3994's plan, from the first depths gathered in the pass)
  let stackPlan = null;
  if (firstAt) {
    const firstRows = [];
    for (const [h, m] of firstAt) for (const [key, d] of m) firstRows.push({ hole_id: h, from: d, value: key });
    const p = holesOrderPlan(firstRows, stackUnits, (u) => [u]);
    stackPlan = { moves: p.moves.length, order: p.order, contradictions: p.contradictions, same: p.same }; // order: the guide's Sort by the holes (#4035)
  }

  // ---- the other tables, one pass each
  let oriented = 0, faultPicks = 0;
  const pickHoles = new Set(), faultPickHoles = new Set(), faultPickTypes = new Set();
  for (const r of arr(layers.structure)) {
    if (!r) continue;
    const dip = Number(r.dip), az = Number(r.azimuth);
    if (!fin(dip) || !fin(az)) continue;
    oriented++; pickHoles.add(r.hole_id);
    const type = `${r.value} ${r.structure_id || ""}`;
    if (faultLikeName(type)) { faultPicks++; faultPickHoles.add(r.hole_id); faultPickTypes.add(`${r.value}|${r.structure_id || ""}`); }
  }
  const veinLog = new Map();
  let veinRows = 0, altRows = 0, densityRows = 0;
  for (const [key, list] of Object.entries(layers)) {
    if (key === "litho" || key === "structure" || !Array.isArray(list)) continue;
    for (const r of list) {
      if (!r) continue;
      if (key === "vein") { veinRows++; if (r.value != null && r.value !== "") { const k = String(r.value), e = veinLog.get(k) || { holes: new Set(), rows: 0 }; e.holes.add(r.hole_id); e.rows++; veinLog.set(k, e); } }
      else if (key === "alt") altRows++;
      else if (key === "sg") densityRows++;
      if (r.from != null && r.to != null && isFaultCode(r.value)) loggedFault++;
    }
  }
  const veins = [...veinLog, ...veinLitho].map(([k, e]) => ({ key: k, holes: e.holes.size, perHole: e.rows / e.holes.size }))
    .sort((a, b) => (a.perHole > SET_PER_HOLE) - (b.perHole > SET_PER_HOLE) || b.holes - a.holes);
  const assays = arr(s.assays), assayHoles = new Set();
  for (const r of assays) if (r) assayHoles.add(r.hole_id);

  // ---- the map: the polygon layer Model from map would open on (MapModelPanel's default) and its units
  const maps = arr(s.mapLayers), polys = maps.filter((l) => l?.geomType === "polygon" && !(l.subcropOutlines || l.subcropFromCollars));
  const mapLayer = polys.find((l) => l.visible !== false) || polys[0] || null;
  let mapUnits = 0, polygons = 0;
  if (mapLayer) {
    const field = mapLayer.styleField || mapLayer.fields?.[0] || Object.keys(mapLayer.features?.[0]?.attributes || {})[0];
    const seen = new Set();
    for (const f of arr(mapLayer.features)) { polygons++; const v = f?.attributes?.[field]; if (v != null && v !== "") seen.add(String(v)); }
    mapUnits = seen.size;
  }

  // ---- drawn contacts, surfaces built
  let sectionContacts = 0, sectionFaults = 0;
  for (const sc of arr(s.sections)) for (const c of arr(sc?.contacts)) { if (c?.kind === "fault") sectionFaults++; else sectionContacts++; }
  const surfaces = arr(s.generatedSurfaces), ids = new Set();
  const strat = new Set(), veinBuilt = new Set(), byType = {};
  for (const x of surfaces) {
    if (!x) continue;
    ids.add(x.id);
    byType[x.type] = (byType[x.type] || 0) + 1;
    if (x.type === "stratigraphic_contact") strat.add(String(x.params?.surface ?? String(x.name || "").replace(/^(Top|Base) of /, "")));
    if (/^vein_/.test(x.type || "") && x.params?.target != null) veinBuilt.add(String(x.params.target));
  }
  const explicit = arr(s.explicitSurfaces);
  const explicitDone = explicit.filter((d) => d?.surfaceId && ids.has(d.surfaceId)), explicitBuilt = explicitDone.length;
  const explicitUnits = new Set(explicitDone.map((d) => String(d.unit || d.name || "").trim()).filter(Boolean)); // #868: the logged unit an explicit surface is the top of
  const groupName = new Map(groups.map((g) => [`group:${g.id}`, g.name]));
  const unitName = (u) => (groupName.has(u) ? groupName.get(u) : String(u).startsWith("mcode:") ? String(u).slice(6) : String(u));
  const stackBuilt = stackUnits.filter((u) => strat.has(unitName(u)) || explicitUnits.has(unitName(u)));

  // ---- the area: drill spacing and groups of holes from the collars, and the box's cells at the quick detail
  const sp = positioned >= MIN_HOLES ? siteSpacing(pts) : { sites: positioned, spacing: null };
  const cl = positioned >= MIN_HOLES ? holeClusters(pts) : null;
  let quickCellM = null, extent = null;
  if (sp.spacing > 0 && x1 >= x0 && zTop > -Infinity) {
    const pad = sp.spacing, bottom = zBot < Infinity ? zBot : zTop - pad;
    extent = [x0 - pad, x1 + pad, y0 - pad, y1 + pad, bottom, zTop];
    const cells = blockCellsM(extent, axisResolution(extent, QUICK_RESOLUTION));
    quickCellM = Math.max(cells[0], cells[1]);
  }

  const faults = {
    picks: faultPicks, pickTypes: faultPickTypes.size, pickHoles: faultPickHoles.size, logged: loggedFault,
    outcrop: arr(s.surfaceStructures).reduce((n, q) => n + arr(q?.rows).filter((r) => r?.cls === "fault").length, 0),
    mapped: mappedFaultFeatures(maps).length, drawn: drawnFaultLines(maps).length, sectionStrings: sectionFaults,
    surfaces: byType.fault || 0, inStack: arr(stack.faults).length,
  };
  return {
    holes, positioned,
    logged: { rows: lithoRows, holes: byHole.size, codes: metres.size, metres: metresAll },
    contacts: { holes: contactHoles, steadyHoles: steadyContactHoles },
    order: { layered: order.order, steady, bodies: order.bodies, candidates: cands, eligible, addable, agree: order.agree, unitInfo, agreeMin: AGREE_MIN, insideMax: INSIDE_MAX },
    cover: cover && !coverRole(cover.unit) ? { unit: cover.unit, starts: coverStarts, of: runs.size } : null,
    coverSet: cover ? coverRole(cover.unit) : false,
    body: body ? { unit: body.unit, holes: unitInfo.get(body.unit)?.holes || 0, inside: unitInfo.get(body.unit)?.inside || 0, role: roleOf(body.unit) } : null,
    thinCodes, leftOut: out.size,
    picks: { oriented, holes: pickHoles.size },
    faults, veins, veinBuilt,
    assays: { rows: assays.length, holes: assayHoles.size, elements: arr(s.assayElements).length },
    alteration: altRows, density: densityRows, veinRows,
    map: { polygons, units: mapUnits, layerId: mapLayer?.id ?? null },
    terrain: !!s.terrain,
    drawn: { sectionContacts, explicit: explicit.length, explicitBuilt },
    stack: { units: stackUnits, built: stackBuilt, relation: stack.relation || "onlap", faults: arr(stack.faults).length, over: Math.max(0, stackUnits.length - GEMPY_MAX_SURFACES), plan: stackPlan },
    built: { strat: strat.size, faults: byType.fault || 0, veins: veinBuilt.size, explicit: byType.explicit_surface || 0, shells: byType.mineralization_envelope || 0, halos: byType.alteration_envelope || 0, bodies: (byType.unit_body || 0) + (byType.intrusion_body || 0), blocks: arr(s.voxelModels).length },
    area: { sites: sp.sites, spacing: sp.spacing, clusters: cl ? cl.clusters.map((c) => ({ n: c.n, ids: c.ids, spanM: c.spanM, cx: c.cx, cy: c.cy })) : [], gapM: cl?.gapM ?? null, quickCellM, extent },
  };
}
