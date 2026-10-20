// TASKS.csv #641 — a 2D DC/IP section's support cutoff applied as a depth-of-investigation ENVELOPE: a cell is
// hidden only when it AND every cell beneath it in its column are below the cutoff. The normalised sensitivity
// wobbles between electrodes (0.09 -> 0.16 -> 0.07 down one column of Woodjam line 115N), so a plain per-cell
// cutoff punched 247 holes through the shallow band (43 of 96 columns) and left detached blobs under them —
// the "broken up, with holes" IP lines in 3D. The envelope keeps everything above the deepest well-seen cell.
// TASKS.csv #681 — those holes, and the bound-pinned cells a "10x own support" guard here used to re-hide, came from
// the DC/IP ordering bug (#652): with the readings correctly paired, the four Woodjam lines have 0 holes, 0 cells at
// the 1000 mV/V bound, the guard re-hid 0 cells, and the envelope hides exactly what a per-cell cutoff hides. The
// guard (a factor with no physical meaning, tuned to an artefact) is gone; the column rule stays as a safeguard.
// Pure (no imports), so the 3D viewer and the section views share it without pulling in the DC/IP parsers.

// keys[i] names cell i's column (distance along the line, or "x|y" in 3D), z[i] its centre elevation.
// Returns each cell's effective support: the largest support at or below it in its column (so "effective >= cutoff"
// means "at or above the deepest cell in its column that the data see").
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
      env[i] = best;
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
