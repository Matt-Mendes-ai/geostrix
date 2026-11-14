// TASKS.csv #3014 part b (design: docs/ideas/multi-element-estimation.md) — Grade-tonnage across a set of same-lattice models (params.set, part a):
// limits on the set's other elements (Fe >= cut-off with SiO2 < 4 % and Al2O3 < 2.5 %), and each member's mean over the blocks counted. The
// members are joined by lattice index, as the density model is (#3012). Pure; loaded with the Grade-tonnage dialog only.
import { blockVolume } from "./gradeTonnage.js";

// the lattice index of a block centre ({ dx, dy, dz, ox, oy, oz } from blockModelLattice), as one number
const keyer = ({ dx, dy, dz, ox, oy, oz }) => (c) => {
  const i = Math.round((c.x - ox) / dx - 0.5), j = Math.round((c.y - oy) / dy - 0.5), k = Math.round((c.z - oz) / dz - 0.5);
  return (i * 2000003 + j) * 2000003 + k;
};

// members: [{ element, unit, name, cells }] on `lattice` -> { members: [{ element, unit, name }], valueAt(cell, m) -> number | undefined }
export function setJoin(lattice, members) {
  const key = keyer(lattice);
  const maps = (members || []).map((m) => { const by = new Map(); for (const c of m.cells || []) if (Number.isFinite(c.value)) by.set(key(c), c.value); return by; });
  return { members: (members || []).map(({ element, unit, name }) => ({ element, unit, name })), valueAt: (c, m) => maps[m]?.get(key(c)) };
}

// limits: [{ op: "max" | "min", value }] by member index (a limit with no number is off). A block counts when every member with a limit has
// a value at it and meets it: SiO2 <= 4 (max), or >= (min). A block with no value of a limited member is left out: its grade there is not known.
// -> { cells, failed, missing: [per member], active: [indices] }
export function applyLimits(cells, join, limits) {
  const active = (limits || []).map((l, m) => (l && Number.isFinite(Number(l.value)) && l.value !== "" ? m : -1)).filter((m) => m >= 0);
  if (!active.length) return { cells, failed: 0, missing: [], active };
  const missing = new Array(join.members.length).fill(0);
  let failed = 0;
  const kept = [];
  for (const c of cells) {
    let ok = true, gap = false;
    for (const m of active) {
      const v = join.valueAt(c, m);
      if (v === undefined) { missing[m]++; gap = true; ok = false; break; }
      const lim = Number(limits[m].value);
      if (limits[m].op === "min" ? v < lim : v > lim) { ok = false; break; }
    }
    if (ok) kept.push(c); else if (!gap) failed++;
  }
  return { cells: kept, failed, missing, active };
}

// each member's mean over the blocks at or above each cutoff (the primary's value), weighted as the table weights its mean grade: by tonnes
// with a density per block, else by volume. `covered`: the share of that volume with a value of the member (a member's own search may leave
// a block of the primary un-estimated). -> [{ cutoff, means: [{ mean, covered }] }]
export function memberMeans(cells, join, { cutoffs, interpolatedOnly = false, densityOf = null } = {}) {
  const blocks = cells.filter((c) => Number.isFinite(c.value) && c.dx > 0 && c.dy > 0 && c.dz > 0 && (!interpolatedOnly || c.support === "interpolated"))
    .map((c) => { const vol = blockVolume(c), rho = densityOf ? densityOf(c) : null; return { v: c.value, vol, w: densityOf ? (rho > 0 ? vol * rho : 0) : vol, at: join.members.map((_, m) => join.valueAt(c, m)) }; });
  return [...cutoffs].sort((a, b) => a - b).map((cutoff) => {
    const means = join.members.map((_, m) => {
      let wsum = 0, gsum = 0, vAll = 0, vHas = 0, volW = 0, volG = 0, wAll = 0, vAllW = 0, vHasW = 0;
      for (const b of blocks) {
        if (b.v < cutoff) continue;
        vAll += b.vol; wAll += b.w; if (b.w > 0) vAllW += b.vol;
        const x = b.at[m];
        if (x === undefined) continue;
        vHas += b.vol; wsum += b.w; gsum += b.w * x; volW += b.vol; volG += b.vol * x; if (b.w > 0) vHasW += b.vol;
      }
      const mean = wsum > 0 ? gsum / wsum : volW > 0 ? volG / volW : null; // no tonnes at all: by volume, as the table does
      // TASKS.csv #3270 — with tonnes, the row counts only the blocks with a density, so the covered share is of their volume
      const tons = densityOf && wAll > 0;
      return { mean, covered: tons ? (vAllW > 0 ? vHasW / vAllW : null) : vAll > 0 ? vHas / vAll : null };
    });
    return { cutoff, means };
  });
}

// the CSV columns of the members' means, one object per cutoff row. cols: [{ col, element }] per member: mean_<col> (the member's value column
// name, SiO2_pct), and <element>_covered_pct for a member whose values miss some of the counted volume at any cutoff (the same columns on every row)
export function memberMeanColumns(meansRows, cols) {
  const partial = cols.map((_, m) => meansRows.some((r) => r.means[m].covered != null && r.means[m].covered < 0.9995));
  return meansRows.map((r) => {
    const out = {};
    r.means.forEach((x, m) => {
      out[`mean_${cols[m].col}`] = x.mean == null ? "" : Number(x.mean.toPrecision(5));
      if (partial[m]) out[`${cols[m].element}_covered_pct`] = x.covered == null ? "" : Math.round(x.covered * 1000) / 10;
    });
    return out;
  });
}
