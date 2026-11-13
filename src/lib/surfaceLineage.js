// TASKS.csv #93 — the lineage half of surfaceVersions.js (its header has the storage-shape reasoning).
// TASKS.csv #3159 — moved verbatim out of surfaceVersions.js (which re-exports it): the 3D view's surface list needs the lineages at
// startup, and importing them from surfaceVersions.js put the compare dialog's parameter and geometry diffs in the startup bundle.

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
