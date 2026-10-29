// TASKS.csv #760 — the geophysical check of a geology model: a categorical block model (the units of a GemPy model added
// as a block model, or any classified block model), a density or susceptibility per unit entered by the user, forward
// modelled at the survey stations and compared with the data. Pure (no DOM): the panel builds the request from these.
import { median } from "./arrayStats.js"; // TASKS.csv #1114 — the true median (mean of the middle two)

// Block models whose cells carry a unit (discrete colour mode with value labels), the ones a property can be given per unit
export function categoricalModels(voxelModels) {
  return (voxelModels || []).filter((m) => m.colorMode === "discrete" && m.valueLabels && Object.keys(m.valueLabels).length && m.cells?.length);
}

// The units of a model: [{value, label, cells}] in label order, counting the cells of each
export function modelUnits(model) {
  const n = new Map();
  (model?.cells || []).forEach((c) => n.set(c.value, (n.get(c.value) || 0) + 1));
  return [...n.entries()].map(([value, cells]) => ({ value, label: model.valueLabels?.[value] ?? String(value), cells }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

// Index of the cell containing (x, y, z), or -1: a hash on the smallest cell size, each cell entered in every bucket it
// overlaps, so models with mixed cell sizes still work
export function cellLocator(cells) {
  if (!cells?.length) return () => -1;
  const s = Math.max(1e-6, cells.reduce((m, c) => Math.min(m, c.dx || Infinity, c.dy || Infinity, c.dz || Infinity), Infinity)); // reduce: no spread over 100k+ cells
  const key = (i, j, k) => `${i},${j},${k}`;
  const map = new Map();
  cells.forEach((c, n) => {
    const i0 = Math.floor((c.x - c.dx / 2) / s), i1 = Math.floor((c.x + c.dx / 2 - 1e-9) / s);
    const j0 = Math.floor((c.y - c.dy / 2) / s), j1 = Math.floor((c.y + c.dy / 2 - 1e-9) / s);
    const k0 = Math.floor((c.z - c.dz / 2) / s), k1 = Math.floor((c.z + c.dz / 2 - 1e-9) / s);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const kk = key(i, j, k);
      if (!map.has(kk)) map.set(kk, []);
      map.get(kk).push(n);
    }
  });
  return (x, y, z) => {
    const list = map.get(key(Math.floor(x / s), Math.floor(y / s), Math.floor(z / s)));
    if (!list) return -1;
    for (const n of list) {
      const c = cells[n];
      if (Math.abs(x - c.x) <= c.dx / 2 && Math.abs(y - c.y) <= c.dy / 2 && Math.abs(z - c.z) <= c.dz / 2) return n;
    }
    return -1;
  };
}


// The median of downhole measurements ([x, y, z, value], model units) inside each unit's cells (Guduk et al. 2021 took
// per-unit susceptibilities from downhole logs the same way): {value: {median, n}}; units with no sample are absent
export function unitMedians(model, points) {
  const at = cellLocator(model?.cells || []);
  const by = new Map();
  (points || []).forEach(([x, y, z, v]) => {
    const n = at(x, y, z);
    if (n < 0 || !Number.isFinite(v)) return;
    const u = model.cells[n].value;
    if (!by.has(u)) by.set(u, []);
    by.get(u).push(v);
  });
  return Object.fromEntries([...by.entries()].map(([u, vs]) => [u, { median: median(vs), n: vs.length }]));
}

// The request body: one row [x, y, z, dx, dy, dz, contrast] per cell whose unit differs from the background
// (contrast = unit property - background). Every unit needs a number; nothing is defaulted.
export function modelBody(model, props, background) {
  const units = modelUnits(model);
  const missing = units.filter((u) => !Number.isFinite(props?.[u.value])).map((u) => u.label);
  if (missing.length) return { problem: `Enter a value for every unit (missing: ${missing.join(", ")}).` };
  if (!Number.isFinite(background)) return { problem: "Enter the background value (the rock around the model, and the space it leaves out)." };
  const cells = [];
  model.cells.forEach((c) => {
    const contrast = props[c.value] - background;
    if (contrast !== 0 && c.dx > 0 && c.dy > 0 && c.dz > 0) cells.push([c.x, c.y, c.z, c.dx, c.dy, c.dz, contrast]);
  });
  if (!cells.length) return { problem: "Every unit has the background value, so the model has no contrast to produce a response." };
  return { cells, units: units.map((u) => ({ label: u.label, cells: u.cells, value: props[u.value], contrast: props[u.value] - background })) };
}
