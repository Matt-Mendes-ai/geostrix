// TASKS.csv #2880 (split from #2820) — the plan grid of Grade x thickness out: GT, thickness and, with kriging, each one's standard deviation, per
// node, as CSV rows or as GeoTIFF bands (gridExport.js writes the file). Pure.
// grid: accumulation.js planGrid / planKriging planGridOK ({ nx, ny, x0, y0, cell, gt, thickness, sdGT?, sdTh? }; x0, y0 the first node, j = 0 the south row)

// the estimated nodes only -> rows { x, y, <gtName>, thickness_m, gt_sd?, thickness_sd? } (a node with no hole in reach has no row)
export function planGridRows(grid, gtName = "gt") {
  if (!grid) return [];
  const { nx, ny, x0, y0, cell, gt, thickness, sdGT, sdTh } = grid, out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = i + nx * j, g = gt[k];
    if (!Number.isFinite(g)) continue;
    const r = { x: +(x0 + i * cell).toFixed(3), y: +(y0 + j * cell).toFixed(3), [gtName]: +g.toPrecision(6), thickness_m: Number.isFinite(thickness[k]) ? +thickness[k].toPrecision(6) : "" };
    if (sdGT) r.gt_sd = Number.isFinite(sdGT[k]) ? +sdGT[k].toPrecision(5) : "";
    if (sdTh) r.thickness_sd = Number.isFinite(sdTh[k]) ? +sdTh[k].toPrecision(5) : "";
    out.push(r);
  }
  return out;
}

// -> { nx, ny, x0, yTop, dx, dy, bands: [{ name, values }] } for gridToGeoTIFF (row 0 = north, x0 / yTop the first cell's centre); a node with no
// estimate is NaN (the writer's no-data). Bands: GT, thickness, then each standard deviation the grid has.
export function planGridBands(grid) {
  if (!grid) return null;
  const { nx, ny, x0, y0, cell } = grid;
  const flip = (v) => { const o = new Float32Array(nx * ny); for (let r = 0; r < ny; r++) for (let i = 0; i < nx; i++) { const x = v[i + nx * (ny - 1 - r)]; o[r * nx + i] = Number.isFinite(x) ? x : NaN; } return o; };
  const bands = [{ name: "GT", values: flip(grid.gt) }, { name: "thickness_m", values: flip(grid.thickness) }];
  if (grid.sdGT) bands.push({ name: "GT kriging standard deviation", values: flip(grid.sdGT) });
  if (grid.sdTh) bands.push({ name: "thickness kriging standard deviation", values: flip(grid.sdTh) });
  return { nx, ny, x0, yTop: y0 + (ny - 1) * cell, dx: cell, dy: cell, bands };
}
