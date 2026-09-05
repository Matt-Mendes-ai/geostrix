// TASKS.csv #93 — ITERATIVE MODELLING WORKFLOW: versioned runs, compare, accept.
//
// Pure logic behind "this surface is a re-run of that one": lineage bookkeeping, a parameter diff
// between two runs, and a quantitative geometry diff (volume delta + surface-to-surface separation).
// three.js-free and DOM-free on purpose, exactly like meshQuery.js (#146) and volumetrics.js (#140):
// every number this file produces is checkable in plain Node against analytic ground truth, and it was
// (see the TASKS.csv #93 notes for the plate/cube numbers, verified BEFORE any UI existed).
//
// ---------------------------------------------------------------------------------------------
// STORAGE SHAPE, AND WHY IT IS `supersedes` RATHER THAN A NESTED `versions` ARRAY
// ---------------------------------------------------------------------------------------------
// The #93 row offered both. This is a flat link (`supersedes` = the id of the run this one replaces),
// for four reasons, in descending order of how much they mattered:
//
//   1. IT MATCHES WHAT THE APP ALREADY DOES. Re-running a modelling tool does NOT overwrite the
//      previous surface — every tool pushes a NEW entry onto implicitSurfaces (runNumericModel,
//      the alteration halo, the vein/dyke pair, runSurfaceStack). So two runs are already two flat,
//      independently-rendered, independently-persisted surfaces. All that was missing was the LINK
//      saying one descends from the other. `supersedes` adds exactly that and nothing else.
//
//   2. NESTING WOULD COST A SECOND CODE PATH FOR EVERY MESH. A surface only exists on screen because
//      ViewerModule's #52 hydration effect walks the FLAT generatedSurfaces list and builds one
//      THREE.Mesh per entry, registered in implicitMeshesRef by id. A mesh buried inside
//      `surface.versions[2]` would be hydrated by nothing: it could not be drawn, zoomed to, volume-
//      checked, sculpted, exported, or fed to the #146 distance query without duplicating all of that.
//      Comparing an old version against a new one is precisely the thing you want to SEE, so a shape
//      that makes old versions unrenderable defeats the feature it was meant to serve.
//
//   3. IT IS PURELY ADDITIVE TO PERSISTENCE — ZERO CHANGES TO store.jsx. Unknown fields already
//      round-trip for free: hydration spreads `...meta` off the persisted object and the sync-out
//      effect spreads `...s` back, so `supersedes`/`accepted` survive save/open/tab-switch/autosave
//      with no new code in the save path at all. A nested `versions` array would have needed the
//      world<->scene vertex conversion, the 1 cm rounding and the geometry cache taught to recurse.
//
//   4. FILE SIZE IS UNCHANGED BY VERSIONING ITSELF. Both shapes store N meshes for N runs; nesting
//      saves no bytes. The metadata this adds is ~60 bytes per surface against a mesh that is
//      0.5–6 MB. What costs file size is KEEPING old runs at all, which is the user's own decision to
//      keep or delete a surface — the same decision they already make today.
//
// RETENTION IS NOT CAPPED, DELIBERATELY. A cap would have to auto-delete a surface the user generated,
// which is the exact trade #52 already rejected for persistence ("silently dropping a surface on save
// is worse than a large file"). Old versions are ordinary surfaces: they show their own size in the
// list, "accept" HIDES the ones it supersedes rather than removing them, and deleting one is the same
// explicit X the user already uses. Nothing here ever discards a run on the user's behalf.
//
// HONESTY: a "version" is a record of a RUN, not evidence that either run is right. Nothing in this
// file ranks two versions or calls one better; it reports what changed between them.

// ---------------------------------------------------------------------------------------------
// LINEAGE
// ---------------------------------------------------------------------------------------------

/**
 * Resolve the flat `supersedes` links into ordered lineages.
 * Each lineage is oldest-first: [v1, v2, v3], where v2.supersedes === v1.id.
 *
 * Defensive about the two ways a flat link list can be malformed after edits/deletes:
 *  - a `supersedes` pointing at a surface that no longer exists (user deleted an old version) — the
 *    pointer is treated as absent, so the survivor becomes its own root rather than vanishing;
 *  - a cycle (A supersedes B supersedes A), which no UI path can create but a hand-edited project
 *    file could — walking stops at the first repeat instead of looping forever.
 *
 * @param {Array<{id:string, supersedes?:string|null}>} surfaces
 * @returns {{lineages: Array<Array<object>>, byId: Map<string, {lineage: Array<object>, index: number}>}}
 */
export function buildLineages(surfaces = []) {
  const byIdRaw = new Map();
  surfaces.forEach((s) => { if (s && s.id) byIdRaw.set(s.id, s); });

  // A link is only honoured if its target still exists AND nothing else already claims that target
  // (two surfaces superseding the same parent would be a fork, not a chain — the second one is
  // demoted to its own root so the chain stays a chain).
  const parentOf = new Map();
  const childOf = new Map();
  surfaces.forEach((s) => {
    const p = s?.supersedes;
    if (!p || !byIdRaw.has(p) || p === s.id) return;
    if (childOf.has(p)) return; // already has a successor — leave this one as its own root
    parentOf.set(s.id, p);
    childOf.set(p, s.id);
  });

  const lineages = [];
  const byId = new Map();
  surfaces.forEach((s) => {
    if (!s || !s.id || parentOf.has(s.id)) return; // not a root
    const chain = [];
    const seen = new Set();
    let cur = s;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.push(cur);
      const nextId = childOf.get(cur.id);
      cur = nextId ? byIdRaw.get(nextId) : null;
    }
    chain.forEach((m, i) => byId.set(m.id, { lineage: chain, index: i }));
    lineages.push(chain);
  });

  return { lineages, byId };
}

/**
 * Convenience: the ordered lineage a given surface belongs to (always length >= 1).
 */
export function lineageOf(surfaces, id) {
  const { byId } = buildLineages(surfaces);
  const hit = byId.get(id);
  if (!hit) {
    const self = (surfaces || []).find((s) => s.id === id);
    return self ? [self] : [];
  }
  return hit.lineage;
}

/**
 * Which surfaces may legally be offered as "this is a new version of ___" for `id`:
 * anything that is not itself, not already superseded by something else, and not a descendant of `id`
 * (which would create a cycle).
 */
export function candidatePredecessors(surfaces = [], id) {
  const { byId } = buildLineages(surfaces);
  const mine = byId.get(id);
  const descendants = new Set();
  if (mine) mine.lineage.slice(mine.index).forEach((s) => descendants.add(s.id));
  const claimed = new Set();
  surfaces.forEach((s) => { if (s.id !== id && s.supersedes) claimed.add(s.supersedes); });
  return surfaces.filter((s) => s.id !== id && !descendants.has(s.id) && !claimed.has(s.id));
}

// ---------------------------------------------------------------------------------------------
// PARAMETER DIFF — nearly free, and usually the most informative half of a comparison
// ---------------------------------------------------------------------------------------------

// Timestamps and per-run bookkeeping are not "parameters the user changed" — they differ on every
// re-run by definition, so listing them as changes buries the one line that actually matters.
// `manuallyEdited`/`manualEditCount`/`lastManualEditAt` are stamped into params by useSculpt (#145).
// They are excluded HERE only because editDisclosure() below reports hand-editing far more
// prominently than a diff row ever could — never to hide it.
const VOLATILE_PARAM_KEYS = new Set([
  "generatedAt", "importedAt", "manuallyEdited", "manualEditCount", "lastManualEditAt",
]);
// Outputs of the run recorded alongside its inputs. Reported separately (they are results, not
// settings) so "what did I change?" isn't drowned in "what came out differently?".
const OUTCOME_PARAM_KEYS = new Set([
  "samplePoints", "cellsEstimated", "singleHoleCells", "meanGradeInShell", "supportCounts",
  "surfaceSupportCounts", "informedNodes", "gridCoarsened", "vertices", "triangles",
  "rmsOffReferencePlaneM", "contactResidualRmsM", "contactResidualMaxM", "midplaneLooRmsM",
  "midplaneLooMaxM", "trueThicknessMinM", "trueThicknessMaxM", "trueThicknessMeanM",
  "downholeThicknessMeanM", "minSeparationM", "intercepts", "sourcePoints", "orientations",
]);

// One level of dotted flattening (anisotropy.azimuth, supportCounts.interpolated, ...). Arrays and
// anything deeper are compared as JSON — exact, and there is no meaningful "partial" diff of a
// resolution triple.
function flattenParams(obj, prefix = "", out = {}, depth = 0) {
  if (!obj || typeof obj !== "object") return out;
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && depth < 2) flattenParams(v, key, out, depth + 1);
    else out[key] = v;
  });
  return out;
}

const sameValue = (a, b) => {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b) || Math.abs(a - b) < 1e-12;
  return JSON.stringify(a) === JSON.stringify(b);
};

const fmtParam = (v) => {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/**
 * Diff two runs' `params` provenance blocks.
 * @returns {{sameTool:boolean, toolA:string|null, toolB:string|null,
 *            changed:Array<{key,from,to,fromText,toText}>,
 *            outcomes:Array<{key,from,to,fromText,toText}>,
 *            onlyA:string[], onlyB:string[], unchangedCount:number}}
 */
export function diffParams(paramsA, paramsB) {
  const a = flattenParams(paramsA || {});
  const b = flattenParams(paramsB || {});
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  const changed = [], outcomes = [], onlyA = [], onlyB = [];
  let unchangedCount = 0;
  keys.forEach((k) => {
    const rootKey = k.split(".")[0];
    if (VOLATILE_PARAM_KEYS.has(rootKey)) return;
    const inA = Object.prototype.hasOwnProperty.call(a, k);
    const inB = Object.prototype.hasOwnProperty.call(b, k);
    if (inA && !inB) { onlyA.push(k); return; }
    if (!inA && inB) { onlyB.push(k); return; }
    if (sameValue(a[k], b[k])) { unchangedCount++; return; }
    const row = { key: k, from: a[k], to: b[k], fromText: fmtParam(a[k]), toText: fmtParam(b[k]) };
    if (OUTCOME_PARAM_KEYS.has(rootKey)) outcomes.push(row); else changed.push(row);
  });
  return {
    sameTool: (paramsA?.tool ?? null) === (paramsB?.tool ?? null),
    toolA: paramsA?.tool ?? null, toolB: paramsB?.tool ?? null,
    changed, outcomes, onlyA, onlyB, unchangedCount,
  };
}

// ---------------------------------------------------------------------------------------------
// GEOMETRY DIFF
// ---------------------------------------------------------------------------------------------

// volumetrics.computeMeshVolume takes a THREE.BufferGeometry, but only ever touches
// attributes.position.{count,getX,getY,getZ} and index.{count,getX}. Presenting a plain triangle soup
// through that same tiny surface reuses the app's ONE volume implementation (divergence theorem +
// open-edge and connected-component detection, already verified under #140/#263) rather than writing a
// second one here that could drift from it.
export function geometryLike(positions, indices) {
  if (!positions || !indices) return null;
  return {
    attributes: {
      position: {
        count: Math.floor(positions.length / 3),
        getX: (i) => positions[i * 3],
        getY: (i) => positions[i * 3 + 1],
        getZ: (i) => positions[i * 3 + 2],
      },
    },
    index: { count: indices.length, getX: (i) => indices[i] },
  };
}

// Deterministic stride so a comparison of the same two surfaces always reports the same numbers (a
// random sample would make a QC figure that changes every time you open the dialog).
function strideFor(vertexCount, maxSamples) {
  if (!maxSamples || vertexCount <= maxSamples) return 1;
  return Math.ceil(vertexCount / maxSamples);
}

function separationOneWay(queryMesh, positions, stride, closestPointOnMesh) {
  const n = Math.floor(positions.length / 3);
  let sum = 0, sumSq = 0, max = 0, count = 0;
  const dists = [];
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n; i += stride) {
    p.x = positions[i * 3]; p.y = positions[i * 3 + 1]; p.z = positions[i * 3 + 2];
    const hit = closestPointOnMesh(queryMesh, p);
    if (!hit) continue;
    const d = hit.distance;
    sum += d; sumSq += d * d; if (d > max) max = d;
    dists.push(d); count++;
  }
  if (!count) return null;
  dists.sort((x, y) => x - y);
  const pct = (q) => dists[Math.min(dists.length - 1, Math.floor(q * (dists.length - 1)))];
  return {
    meanM: sum / count, rmsM: Math.sqrt(sumSq / count), maxM: max,
    medianM: pct(0.5), p95M: pct(0.95), sampled: count, totalVertices: n, stride,
  };
}

/**
 * Quantitative diff between two versions of a surface.
 *
 * Both meshes must be in the SAME coordinate space (this app's scene space is real metres and the
 * scene<->world map is a rigid motion plus one axis flip, so distances and volumes come out in real
 * metres/cubic metres either way — see meshExport.js and volumetrics.js headers).
 *
 * Deps are injected rather than imported so this stays testable in isolation and so the caller keeps
 * control of BVH caching (building one over ~100k triangles costs a few hundred ms — performance is
 * priority #1 here, and nothing below should rebuild a tree the caller already has).
 *
 * @param {{positions:ArrayLike<number>, indices:ArrayLike<number>}} a older version
 * @param {{positions:ArrayLike<number>, indices:ArrayLike<number>}} b newer version
 * @param {object} deps { buildMeshQuery, closestPointOnMesh, computeMeshVolume }
 * @param {object} [opts] { maxSamples = 20000 }
 */
export function compareSurfaceGeometry(a, b, deps, opts = {}) {
  const { buildMeshQuery, closestPointOnMesh, computeMeshVolume } = deps || {};
  if (!a?.positions || !b?.positions) return null;
  const maxSamples = opts.maxSamples ?? 20000;

  const volA = computeMeshVolume(geometryLike(a.positions, a.indices));
  const volB = computeMeshVolume(geometryLike(b.positions, b.indices));
  // A volume is only a volume if the mesh is closed. #140 already refuses to present one otherwise and
  // so does this: an open sheet's "volume" is an artefact of where its boundary happens to be.
  const bothClosed = !!(volA.watertight && volB.watertight);
  const volumeDeltaM3 = bothClosed ? volB.volumeM3 - volA.volumeM3 : null;
  const volumeDeltaPct = bothClosed && volA.volumeM3 > 0 ? ((volB.volumeM3 - volA.volumeM3) / volA.volumeM3) * 100 : null;

  const qa = buildMeshQuery(a.positions, a.indices);
  const qb = buildMeshQuery(b.positions, b.indices);
  const strideB = strideFor(Math.floor(b.positions.length / 3), maxSamples);
  const strideA = strideFor(Math.floor(a.positions.length / 3), maxSamples);
  const bToA = qa ? separationOneWay(qa, b.positions, strideB, closestPointOnMesh) : null;
  const aToB = qb ? separationOneWay(qb, a.positions, strideA, closestPointOnMesh) : null;

  // Symmetric figures. maxM is the sampled two-sided Hausdorff distance — a LOWER BOUND on the true
  // one, because it only measures vertices against surfaces (a bulge in the middle of a large triangle
  // with no vertex on it is not sampled). Reported as such in the UI rather than as "the" maximum.
  let symMean = null, symMax = null;
  if (bToA && aToB) {
    const total = bToA.sampled + aToB.sampled;
    symMean = (bToA.meanM * bToA.sampled + aToB.meanM * aToB.sampled) / total;
    symMax = Math.max(bToA.maxM, aToB.maxM);
  } else if (bToA) { symMean = bToA.meanM; symMax = bToA.maxM; }
  else if (aToB) { symMean = aToB.meanM; symMax = aToB.maxM; }

  const identical = symMax === 0 && bothClosed === (volA.watertight && volB.watertight) &&
    volA.triangleCount === volB.triangleCount;

  return {
    a: { volumeM3: volA.volumeM3, watertight: volA.watertight, openEdgeCount: volA.openEdgeCount, triangleCount: volA.triangleCount, componentCount: volA.componentCount, vertexCount: Math.floor(a.positions.length / 3) },
    b: { volumeM3: volB.volumeM3, watertight: volB.watertight, openEdgeCount: volB.openEdgeCount, triangleCount: volB.triangleCount, componentCount: volB.componentCount, vertexCount: Math.floor(b.positions.length / 3) },
    bothClosed, volumeDeltaM3, volumeDeltaPct,
    bToA, aToB, meanSeparationM: symMean, maxSeparationM: symMax,
    sampledOnly: (strideA > 1 || strideB > 1),
    identical,
  };
}

/**
 * Hand-edit disclosure for a comparison. #145 lets a surface be sculpted after generation, and the
 * export provenance already leads with that; a version diff that ignored it would attribute a volume
 * change to a parameter change that never caused it.
 * @returns {{anyEdited:boolean, a:{count:number, volumeDeltaM3:number|null}, b:{...}, message:string|null}}
 */
export function editDisclosure(surfA, surfB) {
  const side = (s) => {
    const count = s?.editCount || 0;
    const edits = s?.edits || [];
    // useSculpt records volumeBeforeM3/volumeAfterM3 per edit (not a delta), and only the last
    // MAX_HISTORY edits are retained — so this is the change across the RETAINED log, which is the
    // whole log unless the user sculpted more times than that. Same figure meshExport's provenance
    // stamp reports ("as generated -> after manual editing").
    let delta = null;
    if (count > 0 && edits.length) {
      const first = edits[0], last = edits[edits.length - 1];
      if (Number.isFinite(first?.volumeBeforeM3) && Number.isFinite(last?.volumeAfterM3)) {
        delta = last.volumeAfterM3 - first.volumeBeforeM3;
      }
    }
    return { count, volumeDeltaM3: delta };
  };
  const a = side(surfA), b = side(surfB);
  const anyEdited = a.count > 0 || b.count > 0;
  let message = null;
  if (a.count > 0 && b.count > 0) {
    message = `BOTH versions were hand-edited after generation (${a.count} sculpt${a.count === 1 ? "" : "s"} on the older, ${b.count} on the newer). Neither mesh is purely the output of the parameters listed below, so the differences here are parameter changes AND manual edits combined — they cannot be separated from this comparison alone.`;
  } else if (a.count > 0) {
    message = `The OLDER version was hand-edited after generation (${a.count} manual sculpt${a.count === 1 ? "" : "s"}). Part of the difference below is that editing, not the parameter change.`;
  } else if (b.count > 0) {
    message = `The NEWER version was hand-edited after generation (${b.count} manual sculpt${b.count === 1 ? "" : "s"}). Part of the difference below is that editing, not the parameter change.`;
  }
  return { anyEdited, a, b, message };
}

/** Rough persisted size of one surface in the project file — positions + indices dominate. */
export function estimateSurfaceBytes(surface) {
  if (!surface) return 0;
  const v = surface.vertexCount || 0, f = surface.faceCount || 0;
  // Measured against real saves: a 2-dp rounded world coordinate serialises to ~9 chars + separator,
  // an index to ~5. Used only for an order-of-magnitude hint in the UI, never for a decision.
  return v * 3 * 10 + f * 3 * 6;
}
