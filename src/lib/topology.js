// TASKS.csv #90 — TOPOLOGICAL RELATIONSHIP CHECKING (auto-detect geological contradictions).
//
// #83 gave every generated surface a `type` and a list of declared `relationships`
// ("A is below B", "C must not cross D", ...) but nothing ever READ that data — a run could produce a
// pretty, well-triangulated surface that cuts straight through a unit it is declared to sit below and
// the app would say nothing. This module is the missing consumer: a post-generation validation pass
// that takes the surfaces' own meshes plus their declared relationships and reports the ones the
// geometry actually contradicts.
//
// WHY IT LIVES HERE AND NOT IN ViewerModule.jsx: exactly the reason meshQuery.js does. "Do these two
// triangle meshes intersect" and "is surface A above surface B" have checkable right answers, so they
// get hand-verified in plain Node against synthetic meshes whose answer is known by construction
// (two parallel planes -> zero violations; two deliberately crossed planes -> one) before any UI
// exists. See TASKS.csv #90's notes for those numbers.
//
// COORDINATE FRAME: takes whatever frame the caller's meshes are in. ViewerModule passes SCENE space,
// where +Y is up (scene y = elevation - origin.z), so `up: "y"` is the default. Nothing here assumes
// anything else about the axes.
//
// PERFORMANCE (performance is priority #1 on this app's target hardware): every test routes through
// meshQuery.js's median-split BVH, built once per surface and reused across every pairwise test in a
// check run. The crossing test is edge-vs-mesh in BOTH directions (an A edge piercing B, and a B edge
// piercing A) because testing only one direction misses the case where one surface's triangle is
// pierced entirely in its interior — but it early-exits on the FIRST hit, and it skips the pair
// outright when the two bounding boxes don't overlap, so the common "these two surfaces are nowhere
// near each other" case costs one box test. There is also a hard cap on edges tested per pair
// (EDGE_BUDGET) with a uniform stride over the edge list when a mesh is bigger than that, so a pair of
// 100k-triangle imported solids degrades to a sampled test rather than freezing the UI. `sampled: true`
// on the result says when that happened, so a "no violation" answer is never silently over-claimed.

import { buildMeshQuery, segmentIntersections } from "./meshQuery.js";

const EDGE_BUDGET = 20000; // max edges tested per direction per pair

// Where inside each sample cell the vertical probe goes. Deliberately NOT 0.5: a centred probe on a
// regular grid lands exactly on the mesh's own grid lines whenever the sample count and the mesh
// resolution share a factor, which is the worst case for the shared-edge/shared-vertex degeneracies
// verticalHits has to defend against. An irrational-looking offset makes an exact hit on a mesh edge
// a coincidence rather than a pattern. (The dedupe in verticalHits is the real fix; this is belt and
// braces, and free.)
const SAMPLE_OFFSET = 0.3819660112501051; // 1 - 1/phi

function axisIdx(up) {
  return up === "x" ? 0 : up === "z" ? 2 : 1;
}

/**
 * Bounding box of a flat position array. Returns null for an empty mesh.
 */
export function meshBounds(positions) {
  if (!positions || positions.length < 3) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max };
}

function boxesOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  for (let c = 0; c < 3; c++) {
    if (a.min[c] - pad > b.max[c] || b.min[c] - pad > a.max[c]) return false;
  }
  return true;
}

/**
 * Unique undirected edges of a triangle-indexed mesh, as [i0,j0, i1,j1, ...].
 * Deduplicated so a shared edge isn't tested twice (a closed marching-cubes shell shares nearly every
 * edge between two triangles, so this halves the work).
 */
export function meshEdges(indices) {
  const seen = new Set();
  const out = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const pairs = [[a, b], [b, c], [c, a]];
    for (const [p, q] of pairs) {
      const lo = p < q ? p : q, hi = p < q ? q : p;
      const key = lo * 4294967296 + hi;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(lo, hi);
    }
  }
  return out;
}

function pt(positions, i) {
  return { x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] };
}

// One direction of the crossing test: do any of `edges` (indices into `positions`) pierce mesh `q`?
function anyEdgeCrosses(q, positions, edges, budget) {
  const edgeCount = edges.length / 2;
  const stride = edgeCount > budget ? Math.ceil(edgeCount / budget) : 1;
  let tested = 0;
  for (let e = 0; e < edgeCount; e += stride) {
    const a = pt(positions, edges[e * 2]);
    const b = pt(positions, edges[e * 2 + 1]);
    tested++;
    const hits = segmentIntersections(q, a, b);
    if (hits.length) {
      return {
        crosses: true,
        tested,
        sampled: stride > 1,
        point: {
          x: a.x + (b.x - a.x) * hits[0],
          y: a.y + (b.y - a.y) * hits[0],
          z: a.z + (b.z - a.z) * hits[0],
        },
      };
    }
  }
  return { crosses: false, tested, sampled: stride > 1, point: null };
}

/**
 * Do two triangle meshes intersect?
 *
 * @param a {positions, indices, query?, edges?, bounds?}  — query/edges/bounds are reused if supplied
 * @param b same shape
 * @returns {{crosses:boolean, point:{x,y,z}|null, sampled:boolean, edgesTested:number}}
 */
export function meshesCross(a, b, opts = {}) {
  const budget = opts.edgeBudget || EDGE_BUDGET;
  const boundsA = a.bounds || meshBounds(a.positions);
  const boundsB = b.bounds || meshBounds(b.positions);
  if (!boundsA || !boundsB || !boxesOverlap(boundsA, boundsB)) {
    return { crosses: false, point: null, sampled: false, edgesTested: 0 };
  }
  const qA = a.query || buildMeshQuery(a.positions, a.indices);
  const qB = b.query || buildMeshQuery(b.positions, b.indices);
  if (!qA || !qB) return { crosses: false, point: null, sampled: false, edgesTested: 0 };
  const edgesB = b.edges || meshEdges(b.indices);
  const r1 = anyEdgeCrosses(qA, b.positions, edgesB, budget);
  if (r1.crosses) return { crosses: true, point: r1.point, sampled: r1.sampled, edgesTested: r1.tested };
  const edgesA = a.edges || meshEdges(a.indices);
  const r2 = anyEdgeCrosses(qB, a.positions, edgesA, budget);
  return {
    crosses: r2.crosses,
    point: r2.point,
    sampled: r1.sampled || r2.sampled,
    edgesTested: r1.tested + r2.tested,
  };
}

/**
 * Heights of a surface directly above/below a location, i.e. where a vertical line through (u,v) meets
 * the mesh. Returns every hit, sorted low to high, in the up-axis coordinate.
 */
export function verticalHits(mesh, u, v, opts = {}) {
  const up = opts.up || "y";
  const ai = axisIdx(up);
  const bounds = mesh.bounds || meshBounds(mesh.positions);
  if (!bounds) return [];
  const q = mesh.query || buildMeshQuery(mesh.positions, mesh.indices);
  if (!q) return [];
  const span = bounds.max[ai] - bounds.min[ai];
  const pad = Math.max(1, span * 0.05);
  const lo = bounds.min[ai] - pad, hi = bounds.max[ai] + pad;
  const other = [0, 1, 2].filter((c) => c !== ai);
  const mk = (h) => {
    const c = [0, 0, 0];
    c[ai] = h;
    c[other[0]] = u;
    c[other[1]] = v;
    return { x: c[0], y: c[1], z: c[2] };
  };
  const a = mk(lo), b = mk(hi);
  const raw = segmentIntersections(q, a, b).map((t) => lo + (hi - lo) * t).sort((x, y) => x - y);
  // DEDUPE COINCIDENT HITS. Caught by the Node verification for #90, not by reading the code: a flat,
  // single-valued plane reported 20 of 100 sample locations as "folded". Root cause is the classic
  // shared-edge double count — a vertical ray that passes exactly through an edge shared by two
  // triangles is reported once per triangle, so a perfectly flat heightfield looks multivalued
  // wherever a sample lands on a mesh grid line, which on a regular marching-cubes/GemPy grid is
  // constantly rather than rarely. Two hits at the same height are one crossing; a genuine fold puts
  // its two sheets metres apart, far outside this tolerance.
  const tol = Math.max(1e-9, (hi - lo) * 1e-7);
  const out = [];
  for (const h of raw) if (!out.length || h - out[out.length - 1] > tol) out.push(h);
  return out;
}

/**
 * SIDEDNESS: what fraction of a surface's own footprint sits on the wrong side of another surface?
 *
 * Used for the declared "A is below B" / "A is above B" relationships. Two surfaces can fail to
 * intersect and still be wrong — a surface declared to lie below another can sit entirely above it,
 * which no crossing test would ever catch. Samples a regular grid over the OVERLAP of the two
 * footprints (there is nothing to compare where only one surface exists), takes the vertical hit on
 * each, and counts how many samples have A on the declared side of B.
 *
 * @returns {{compared:number, wrong:number, fraction:number, worst:{u,v,aH,bH,gap}|null}}
 */
export function sidednessCheck(a, b, expected, opts = {}) {
  const up = opts.up || "y";
  const ai = axisIdx(up);
  const other = [0, 1, 2].filter((c) => c !== ai);
  const n = opts.grid || 12;
  const bA = a.bounds || meshBounds(a.positions);
  const bB = b.bounds || meshBounds(b.positions);
  const empty = { compared: 0, wrong: 0, fraction: 0, worst: null };
  if (!bA || !bB) return empty;
  const u0 = Math.max(bA.min[other[0]], bB.min[other[0]]);
  const u1 = Math.min(bA.max[other[0]], bB.max[other[0]]);
  const v0 = Math.max(bA.min[other[1]], bB.min[other[1]]);
  const v1 = Math.min(bA.max[other[1]], bB.max[other[1]]);
  if (!(u1 > u0) || !(v1 > v0)) return empty; // footprints don't overlap — nothing comparable
  const qa = { ...a, query: a.query || buildMeshQuery(a.positions, a.indices), bounds: bA };
  const qb = { ...b, query: b.query || buildMeshQuery(b.positions, b.indices), bounds: bB };
  let compared = 0, wrong = 0, worst = null;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = u0 + ((i + SAMPLE_OFFSET) / n) * (u1 - u0);
      const v = v0 + ((j + SAMPLE_OFFSET) / n) * (v1 - v0);
      const ha = verticalHits(qa, u, v, { up });
      const hb = verticalHits(qb, u, v, { up });
      if (!ha.length || !hb.length) continue;
      // Compare the MEDIAN hit on each so a locally multivalued (folded) patch doesn't decide the
      // answer on one arbitrary sheet.
      const aH = ha[Math.floor(ha.length / 2)];
      const bH = hb[Math.floor(hb.length / 2)];
      compared++;
      const ok = expected === "below" ? aH <= bH : aH >= bH;
      if (!ok) {
        wrong++;
        const gap = Math.abs(aH - bH);
        if (!worst || gap > worst.gap) worst = { u, v, aH, bH, gap };
      }
      void ai;
    }
  }
  return { compared, wrong, fraction: compared ? wrong / compared : 0, worst };
}

/**
 * INVERSION / OVERTURNING: is this surface multivalued in the vertical?
 *
 * A stratigraphic contact modelled from drillhole tops should be a single-valued heightfield — one
 * elevation per (x,y). More than one vertical hit means the surface folds back over itself, which for
 * a contact surface is almost always an interpolation artefact (a bulge closing on itself) rather than
 * a real overturned fold, and is exactly the kind of "pretty but wrong" result #90 exists to flag.
 * A CLOSED envelope (grade shell, alteration halo) is multivalued by construction — it has a top and a
 * bottom — so callers must only run this on open contact-type surfaces; `expectHits` makes that
 * explicit (1 for an open sheet, 2 for a closed shell).
 *
 * @returns {{sampled:number, folded:number, fraction:number, worst:{u,v,hits:number}|null}}
 */
export function inversionCheck(mesh, opts = {}) {
  const up = opts.up || "y";
  const ai = axisIdx(up);
  const other = [0, 1, 2].filter((c) => c !== ai);
  const n = opts.grid || 14;
  const expectHits = opts.expectHits || 1;
  const b = mesh.bounds || meshBounds(mesh.positions);
  const empty = { sampled: 0, folded: 0, fraction: 0, worst: null };
  if (!b) return empty;
  const q = { ...mesh, query: mesh.query || buildMeshQuery(mesh.positions, mesh.indices), bounds: b };
  const u0 = b.min[other[0]], u1 = b.max[other[0]];
  const v0 = b.min[other[1]], v1 = b.max[other[1]];
  let sampled = 0, folded = 0, worst = null;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = u0 + ((i + SAMPLE_OFFSET) / n) * (u1 - u0);
      const v = v0 + ((j + SAMPLE_OFFSET) / n) * (v1 - v0);
      const hits = verticalHits(q, u, v, { up });
      if (!hits.length) continue;
      sampled++;
      if (hits.length > expectHits) {
        folded++;
        if (!worst || hits.length > worst.hits) worst = { u, v, hits: hits.length };
      }
      void ai;
    }
  }
  return { sampled, folded, fraction: sampled ? folded / sampled : 0, worst };
}

// Which declared relationships imply "these two surfaces must not intersect", and which imply a
// vertical ordering. Vocabulary is #83's RELATION_TYPES; anything not listed here (truncates,
// terminates_against, cuts) describes a relationship where an intersection is EXPECTED and therefore
// has nothing to violate — those are skipped rather than guessed at, and the caller is told how many
// were skipped so "0 violations" can't be read as "everything was checked".
const NO_CROSS_RELATIONS = new Set(["must_not_cross", "below", "above"]);
const ORDER_RELATIONS = { below: "below", above: "above" };

/**
 * THE WHOLE CHECK. Runs every applicable test over a set of surfaces and returns a flat list of
 * violations, each already phrased for the notice/toast the caller shows.
 *
 * @param surfaces [{ id, name, type, relationships:[{relation,targetId}], closure, positions, indices }]
 * @param opts.up  up axis of the coordinate frame ("y" for ViewerModule's scene space)
 * @returns {{violations:[{kind, surfaceId, targetId, message, point}], checked:number,
 *            skipped:number, surfacesChecked:number}}
 */
export function checkTopology(surfaces, opts = {}) {
  const up = opts.up || "y";
  const byId = new Map();
  const prepared = [];
  for (const s of surfaces || []) {
    if (!s || !s.positions || !s.positions.length || !s.indices || !s.indices.length) continue;
    const p = {
      id: s.id, name: s.name || s.id, type: s.type || "other",
      relationships: s.relationships || [], closure: s.closure,
      positions: s.positions, indices: s.indices,
      bounds: meshBounds(s.positions),
      query: null, edges: null,
    };
    byId.set(s.id, p);
    prepared.push(p);
  }
  const q = (p) => (p.query || (p.query = buildMeshQuery(p.positions, p.indices)));
  const eg = (p) => (p.edges || (p.edges = meshEdges(p.indices)));

  const violations = [];
  let checked = 0, skipped = 0;

  for (const a of prepared) {
    for (const rel of a.relationships) {
      const b = byId.get(rel.targetId);
      if (!b) { skipped++; continue; }
      if (!NO_CROSS_RELATIONS.has(rel.relation)) { skipped++; continue; }
      checked++;
      const cross = meshesCross(
        { ...a, query: q(a), edges: eg(a) },
        { ...b, query: q(b), edges: eg(b) },
        opts
      );
      if (cross.crosses) {
        violations.push({
          kind: "intersection",
          surfaceId: a.id, targetId: b.id,
          message: `"${a.name}" is declared ${rel.relation.replace(/_/g, " ")} "${b.name}", but the two surfaces intersect.`,
          point: cross.point,
        });
      }
      const expected = ORDER_RELATIONS[rel.relation];
      if (expected) {
        const side = sidednessCheck(
          { ...a, query: q(a) }, { ...b, query: q(b) }, expected, { up, grid: opts.grid }
        );
        if (side.compared && side.fraction > 0.02) {
          violations.push({
            kind: "wrong_side",
            surfaceId: a.id, targetId: b.id,
            message: `"${a.name}" is declared ${expected} "${b.name}", but ${side.wrong} of ${side.compared} sampled locations have it on the wrong side (worst gap ${side.worst ? side.worst.gap.toFixed(1) : "?"} m).`,
            point: side.worst ? null : null,
          });
        }
      }
    }
  }

  // Self-consistency: an OPEN contact-type surface that folds back over itself in the vertical.
  // Closed envelopes (a grade shell, a closed alteration halo) are excluded by construction — see
  // inversionCheck's own comment.
  for (const a of prepared) {
    const isOpenContact = (a.type === "stratigraphic_contact" || a.type === "unconformity" || a.type === "intrusive_contact")
      && !a.closure;
    if (!isOpenContact) continue;
    checked++;
    const inv = inversionCheck({ ...a, query: q(a) }, { up, grid: opts.grid });
    if (inv.sampled && inv.fraction > 0.05) {
      violations.push({
        kind: "inverted",
        surfaceId: a.id, targetId: null,
        message: `"${a.name}" folds back over itself at ${inv.folded} of ${inv.sampled} sampled locations (a contact surface should have one elevation per location) — usually an interpolation artefact rather than a real overturned fold.`,
        point: null,
      });
    }
  }

  return { violations, checked, skipped, surfacesChecked: prepared.length };
}
