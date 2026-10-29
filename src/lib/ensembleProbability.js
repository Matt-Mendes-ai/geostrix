// TASKS.csv #757 — where the geology itself is uncertain, from the sensitivity ensemble (#52): each realisation's
// lithology block is counted per cell, giving per cell the share of realisations with each unit, p_k(x), and the
// information entropy H(x) = -sum_k p_k log2 p_k (Wellmann & Regenauer-Lieb 2012; GemPy 1.0 sec. 3.4.1). H = 0 where
// every realisation agrees; the maximum is log2(number of units). Plus each unit's volume in every realisation, so the
// spread of a volume is reported as a distribution (Stamm et al. 2019), not one number.
//
// It is a SENSITIVITY ensemble under the sigmas the geologist entered (#52's vocabulary): the probabilities are shares
// of realisations, not a posterior. Pure; no React / three.js.
import { quantileLinear } from "./arrayStats.js"; // TASKS.csv #1114

// block: { resolution: [nx, ny, nz], ids (1-based unit ids, length nx*ny*nz), labels } — the engine's block (#356)
export function makeEnsembleCounter(nCells, nLabels) {
  const counts = new Uint16Array(nCells * nLabels);
  const volumesCells = []; // per realisation: cells per label
  let runs = 0;
  return {
    add(ids) {
      if (!ids || ids.length !== nCells) return false;
      const per = new Array(nLabels).fill(0);
      for (let i = 0; i < nCells; i++) {
        const k = ids[i] - 1;
        if (k < 0 || k >= nLabels) continue;
        counts[i * nLabels + k]++;
        per[k]++;
      }
      volumesCells.push(per);
      runs++;
      return true;
    },
    get runs() { return runs; },
    // probability of label k per cell (Float32Array) and entropy in bits per cell
    result() {
      const prob = Array.from({ length: nLabels }, () => new Float32Array(nCells));
      const entropy = new Float32Array(nCells);
      if (!runs) return { prob, entropy, runs };
      for (let i = 0; i < nCells; i++) {
        let h = 0;
        for (let k = 0; k < nLabels; k++) {
          const p = counts[i * nLabels + k] / runs;
          prob[k][i] = p;
          if (p > 0) h -= p * Math.log2(p);
        }
        entropy[i] = h < 1e-9 ? 0 : h;
      }
      return { prob, entropy, runs, volumesCells };
    },
  };
}

// q-th quantile (0..1) of a numeric array, linear interpolation: arrayStats.js since TASKS.csv #1114 (NaN when empty)
export { quantileLinear as quantile };

// Regular-grid values -> voxel cells in world coordinates (same layout as modelCheck.blockToCells: ids ordered z
// fastest, then y, then x). `keep(value, index)` decides which cells become cells (e.g. only uncertain ones).
// `map` (optional): for a trend model, real-space cell index -> warped-block cell index + 1 (0 = outside).
export function gridValuesToCells(extent, resolution, values, origin = { x: 0, y: 0, z: 0 }, keep = () => true, map = null) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = extent;
  const [nx, ny, nz] = resolution;
  const dx = (xmax - xmin) / nx, dy = (ymax - ymin) / ny, dz = (zmax - zmin) / nz;
  const cells = [];
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
    const i = ix * ny * nz + iy * nz + iz;
    let src = i;
    if (map) { const m = map[i]; if (!m) continue; src = m - 1; }
    const v = values[src];
    if (!keep(v, src)) continue;
    cells.push({ x: origin.x + xmin + (ix + 0.5) * dx, y: origin.y + ymin + (iy + 0.5) * dy, z: origin.z + zmin + (iz + 0.5) * dz, dx, dy, dz, value: v });
  }
  return cells;
}
