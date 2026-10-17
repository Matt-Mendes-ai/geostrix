// TASKS.csv #641 — a 2D DC/IP section's support cutoff applied as a depth-of-investigation ENVELOPE: a cell is
// hidden only when it AND every cell beneath it in its column are below the cutoff. The normalised sensitivity
// wobbles between electrodes (0.09 -> 0.16 -> 0.07 down one column of Woodjam line 115N), so a plain per-cell
// cutoff punched 247 holes through the shallow band (43 of 96 columns) and left detached blobs under them —
// the "broken up, with holes" IP lines in 3D. The envelope keeps everything above the deepest well-seen cell —
// except a cell the data see ten times LESS than the cutoff: filling every hole also uncovered a few such cells
// pinned at the inversion's bound (2-6 per Woodjam line at 200-1000 mV/V, own support 0.0005-0.002, 100-160 m
// deep). The 10x margin re-hides 9-30 cells per line against 103-269 filled, and all but 2 of those artefacts.
// Pure (no imports), so the 3D viewer and the section views share it without pulling in the DC/IP parsers.

// keys[i] names cell i's column (distance along the line, or "x|y" in 3D), z[i] its centre elevation.
// Returns each cell's effective support: the largest support at or below it in its column, but never more than
// ten times its own (so "effective >= cutoff" means "above the depth of investigation AND seen at a tenth of it").
export function supportEnvelope(keys, z, support) {
  const n = support.length;
  const cols = new Map();
  for (let i = 0; i < n; i++) {
    const k = keys[i];
    let a = cols.get(k);
    if (!a) cols.set(k, (a = []));
    a.push(i);
  }
  const env = new Float64Array(n);
  for (const idx of cols.values()) {
    idx.sort((a, b) => z[a] - z[b]); // deepest first
    let best = -Infinity;
    for (const i of idx) {
      const s = support[i] == null ? Infinity : support[i]; // a cell without support is never hidden
      if (s > best) best = s;
      env[i] = Math.min(best, 10 * s);
    }
  }
  return env;
}

// The same envelope for a 3D voxel model built from a DC/IP section (cells {x, y, z, support}), cached per
// cells array: a Map from cell to its envelope support.
const cache = new WeakMap();
export function cellSupportEnvelope(cells) {
  let m = cache.get(cells);
  if (m) return m;
  const keys = cells.map((c) => `${Math.round(c.x * 100)}|${Math.round(c.y * 100)}`);
  const env = supportEnvelope(keys, cells.map((c) => c.z), cells.map((c) => c.support));
  m = new Map();
  cells.forEach((c, i) => m.set(c, env[i]));
  cache.set(cells, m);
  return m;
}
