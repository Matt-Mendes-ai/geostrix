// TASKS.csv #3014 (part a; design: docs/ideas/multi-element-estimation.md) — several elements estimated in one run: one block model per
// element, on one lattice, with one search and one domain rule, recorded as a set (params.set on each member). A model with no params.set is
// a single-element model, as before; each member is still an ordinary model on its own. Pure: no React, no store.
import { blockModelLattice } from "./estimationMeta.js";
import { sameLattice } from "./densityFromModel.js";

export const MAX_SET_ELEMENTS = 8; // the primary and up to seven others: each is a run of its own

// the elements that may join the primary: the dialog's elements, in its order, less the primary
export const setChoices = (symbols, primary) => (symbols || []).filter((s) => s !== primary);
// the others picked, kept to those still offered, in the dialog's order, at most MAX_SET_ELEMENTS - 1
export function setOthers(picked, symbols, primary) {
  const want = new Set(picked || []);
  return setChoices(symbols, primary).filter((s) => want.has(s)).slice(0, MAX_SET_ELEMENTS - 1);
}

export const newSetId = (now = Date.now(), rnd = Math.random()) => `set-${now.toString(36)}-${Math.floor(rnd * 1e8).toString(36)}`;
// what each member records (project data: English)
export const setRecord = (id, primary, others) => ({ id, elements: [primary, ...others], primary });

// the name a hard-boundary estimate carries: "…, by Lithology" (#2876's review: it did not say it)
export const domainNameSuffix = (p) => (p?.restrictToDomain && p.domain ? `, by ${p.domain}` : "");
// a member's name from the primary's: the element swapped at the front ("Fe estimate (…)" -> "SiO2 estimate (…)"), the set said after it.
// A name typed in the dialog keeps its text and takes the element after it.
export function memberName(primaryName, primary, element, set, typed = false) {
  const list = set.elements.join(", ");
  if (typed) return element === primary ? `${primaryName} (set: ${list})` : `${primaryName} — ${element} (set: ${list})`;
  const lead = `${primary} estimate`;
  const base = element !== primary && primaryName.startsWith(lead) ? `${element} estimate${primaryName.slice(lead.length)}` : primaryName;
  return `${base} (set: ${list})`;
}

// the blocks kept after the primary's trims, for a member: inside the restricting solid, inside the design-string area, not above the ground
// (the same tests, so a member's blocks are a subset of the same lattice cut the same way). -> { cells, dropped }
export function trimLike(cells, { inShell = null, inArea = null, groundAt = null } = {}) {
  const kept = cells.filter((c) => (!inShell || inShell(c)) && (!inArea || inArea(c.x, c.y)) && !(groundAt && ((g) => Number.isFinite(g) && c.z > g)(groundAt(c.x, c.y))));
  return { cells: kept, dropped: cells.length - kept.length };
}

// a member's summary for the result: blocks, composites and the volume-weighted mean of its blocks
export function memberSummary(element, unit, cells, points) {
  let v = 0, m = 0;
  for (const c of cells) { if (!Number.isFinite(c.value)) continue; const w = c.dx * c.dy * c.dz; v += w; m += w * c.value; }
  return { element, unit, blocks: cells.length, composites: points, mean: v > 0 ? m / v : null };
}

// the other members of a model's set present in `models`, on its lattice (a member removed, or a model replaced on another grid, drops out)
export function setMembersOf(model, models) {
  const id = model?.params?.set?.id;
  if (!id) return [];
  const lat = blockModelLattice(model);
  return (models || []).filter((m) => m !== model && m.params?.set?.id === id && sameLattice(lat, blockModelLattice(m)));
}

// the primary's params that belong to its element, not to the set's shared grid and search: a member drops them and records its own
export const MEMBER_OWN_KEYS = ["capValue", "capUnit", "capAudit", "capByDomain", "unsampledMetres", "sampledShareOfHoles", "unsampledValue", "unsampledUnit", "unsampledFilledM", "unsampledHolesFilled", "unsampledUnassayedHoles", "unsampledUnassayedM", "unsampledLog", "unsampledLogUnit", "unsampledLogFactor", "unsampledLogFilledM", "unsampledLogNoReadingM", "unsampledLeftOutM", "unsampledDrillPoints", "mlsBlocks", "variogram", "krigingBlocks", "effectivelyOneHoleBlocks", "cutAtTerrain", "restrictedToVolume", "samplePoints", "set"];
