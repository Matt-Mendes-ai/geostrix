// TASKS.csv #759 — modelled lithology on cross-sections: the implicit model's unit on a vertical grid down the section
// line, drawn behind the logged holes (geologists judge a model on sections first). Pure (no DOM): the run evaluates
// saved sections' grids exactly in the same GemPy solve (#756); any other section reads the last model's block.

// A vertical grid on the section line a -> b over elevations [z0, z1], at >= minSpacing metres and at most ~maxPts
// nodes. Nodes above the ground (groundAt(x, y) -> elevation or NaN) are left out: the model above the terrain is air.
// Row 0 is the TOP (highest z), matching image row order; i runs from a to b.
export function sectionGrid(a, b, z0, z1, { maxPts = 4000, minSpacing = 2, groundAt = null } = {}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 0) || !(z1 > z0)) return null;
  const step = Math.max(minSpacing, Math.sqrt((len * (z1 - z0)) / maxPts));
  const nx = Math.max(1, Math.round(len / step)), ny = Math.max(1, Math.round((z1 - z0) / step));
  const dl = len / nx, dz = (z1 - z0) / ny;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const nodes = [];
  for (let i = 0; i < nx; i++) {
    const l = (i + 0.5) * dl, x = a.x + ux * l, y = a.y + uy * l;
    const g = groundAt ? groundAt(x, y) : NaN;
    for (let j = 0; j < ny; j++) {
      const z = z1 - (j + 0.5) * dz;
      if (Number.isFinite(g) && z > g) continue;
      nodes.push({ i, j, x, y, z });
    }
  }
  return { len, z0, z1, nx, ny, dl, dz, nodes };
}

// Which saved sections get an exact evaluation in a model run, within a total point budget: each point costs solve
// time (~0.45 ms, measured live on Harry: 16,000 points added 7 s to a 36 s run, so the budget is 8,000). Single
// sections first (a fence series can hold thousands), most recently saved first; returns them with the points each
// may use.
export function pickSections(sections, { maxSections = 4, perSection = 8000, total = 8000 } = {}) {
  const list = (sections || []).filter((s) => [s.ax, s.ay, s.bx, s.by].every(Number.isFinite) && Math.hypot(s.bx - s.ax, s.by - s.ay) > 0);
  const picked = [...list.filter((s) => !s.groupId).reverse(), ...list.filter((s) => s.groupId).reverse()].slice(0, maxSections);
  return { sections: picked, perSection: picked.length ? Math.min(perSection, Math.floor(total / picked.length)) : 0 };
}

// Same geometry as when the model was evaluated (a section moved since then needs a new run for exact units)
export const sameLine = (s, e) => ["ax", "ay", "bx", "by"].every((k) => Math.abs(Number(s[k]) - Number(e[k])) < 1e-6);

// Compact per-node unit storage: an index into `labels` (-1 = no unit / outside the model)
export function packUnits(units) {
  const labels = [], idx = new Map();
  const codes = Int16Array.from(units, (u) => {
    if (u == null) return -1;
    if (!idx.has(u)) { idx.set(u, labels.length); labels.push(u); }
    return idx.get(u);
  });
  return { labels, codes };
}
export const unpackUnits = ({ labels, codes }) => Array.from(codes, (c) => (c < 0 ? null : labels[c]));

// RGBA pixels (nx * ny, row 0 top) for the grid: each node in its unit's colour, transparent where there is no unit
export function sectionPixels(grid, units, colorOf) {
  const px = new Uint8ClampedArray(grid.nx * grid.ny * 4);
  grid.nodes.forEach((n, k) => {
    const u = units[k];
    if (u == null) return;
    const [r, g, b] = hexRgb(colorOf(u));
    const o = (n.j * grid.nx + n.i) * 4;
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
  });
  return px;
}

const hexRgb = (c) => {
  const h = String(c || "").replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((s) => s + s).join("") : h, 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [128, 128, 128];
};

// The block's horizontal and vertical cell size: finer sampling of the block than this adds nothing
export function blockSpacing(block) {
  const [x0, x1, y0, y1, z0, z1] = block.extent, [nx, ny, nz] = block.resolution;
  return { horizontal: Math.min((x1 - x0) / nx, (y1 - y0) / ny), vertical: (z1 - z0) / nz };
}

// The elevations worth drawing on a section: those of the hole traces within `corridor` of the line (points with
// x, y, z), padded by a quarter of their span (at least 25 m) and kept inside [zMin, zMax] (the model's box). With no
// hole near the line, the whole box. Saves solve points on the model's padding far below the drilling.
export function sectionZRange(points, a, b, corridor, zMin, zMax) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 0)) return [zMin, zMax];
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  let lo = Infinity, hi = -Infinity;
  for (const p of points) {
    const dx = p.x - a.x, dy = p.y - a.y, l = dx * ux + dy * uy;
    if (l < 0 || l > len || Math.abs(-dx * uy + dy * ux) > corridor || !Number.isFinite(p.z)) continue;
    if (p.z < lo) lo = p.z;
    if (p.z > hi) hi = p.z;
  }
  if (!(hi >= lo)) return [zMin, zMax];
  const padM = Math.max(25, (hi - lo) / 4);
  const r = [Math.max(zMin, lo - padM), Math.min(zMax, hi + padM)];
  return r[1] > r[0] ? r : [zMin, zMax];
}
