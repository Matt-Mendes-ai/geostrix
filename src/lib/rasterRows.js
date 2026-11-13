// TASKS.csv #3142 (the import half of #3033) — the Geosoft .gxf and Geosoft / Surfer .grd readers and the node grid's picture, moved out of
// raster.js unchanged so the raster-import worker (rasterImport.worker.js) can run them: no DOM, no geotiff, no CRS registry. raster.js's
// parseGXF / parseGRD wrap the same functions (and draw the picture on a canvas), so the result is the same on either thread.
// The comments of the moved code are the originals.
import { inflateCapped, MB } from "./inflate.js"; // TASKS.csv #1347
import { decodeGrd } from "./grdFormats.js"; // TASKS.csv #1347
import { stretchP298 } from "./percentileSelect.js"; // TASKS.csv #708 — the same 2-98 % stretch as IDW grids (makeStretch's), by selection: #3142
import { pictureColour } from "./gridPicture.js"; // raster.js's viridis ramp (test/gridPicture3033 checks they are the same table)
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

export const MAX_TEXTURE_SIZE = 2048; // raster.js's own (see its comment)

// TASKS.csv #326 — single-band grids keep their VALUES (not just the colour-mapped picture), so they can
// feed an inversion as survey points and the potential-field filters (#373). Stored node-based, row 0 =
// north: value (i, j) sits at x0 + i*dx, yTop - j*dy. Block-averaged down to at most GRID_MAX nodes on the
// longest side (every autosave writes the project file; a full-resolution airborne grid would add tens of
// MB to each one). No-data nodes are NaN.
export const GRID_MAX = 512;
export function makeValueGrid(values, nx, ny, x0, yTop, dx, dy, isNoData) {
  const f = Math.max(1, Math.ceil(Math.max(nx, ny) / GRID_MAX));
  const gx = Math.ceil(nx / f), gy = Math.ceil(ny / f);
  const out = new Float32Array(gx * gy);
  // TASKS.csv #2831 — averaged, each block's highest and lowest value are kept beside its mean, and the range of the values averaged
  const mx = f > 1 ? new Float32Array(gx * gy) : null, mn = f > 1 ? new Float32Array(gx * gy) : null;
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    let s = 0, n = 0, bmx = -Infinity, bmn = Infinity;
    for (let b = 0; b < f; b++) for (let a = 0; a < f; a++) {
      const ii = i * f + a, jj = j * f + b;
      if (ii >= nx || jj >= ny) continue;
      const v = values[jj * nx + ii];
      if (!isNoData(v)) { s += v; n++; if (v > bmx) bmx = v; if (v < bmn) bmn = v; }
    }
    out[j * gx + i] = n ? s / n : NaN;
    if (mx) { mx[j * gx + i] = n ? bmx : NaN; mn[j * gx + i] = n ? bmn : NaN; }
    if (n) { if (bmx > hi) hi = bmx; if (bmn < lo) lo = bmn; }
  }
  // a block's centre: the mean of the node positions it averages
  const cx = (i) => x0 + dx * (i * f + (Math.min(f, nx - i * f) - 1) / 2);
  const cy = (j) => yTop - dy * (j * f + (Math.min(f, ny - j * f) - 1) / 2);
  return { nx: gx, ny: gy, x0: cx(0), yTop: cy(0), dx: dx * f, dy: dy * f, values: out, averagedBy: f, sourceSize: [nx, ny], ...(mx ? { maxValues: mx, minValues: mn, sourceRange: Number.isFinite(lo) ? [lo, hi] : null } : {}) }; // #2831
}

// TASKS.csv #2828 (GSC geophysics review, 2026-11-12) — a grid of NODES (GXF, Geosoft / Surfer .grd: x0, y0 is the first node, the last one sits (n - 1)
// cells on) as the PIXEL-AREA extent the drape spans: half a cell beyond the end nodes on every side, so each of the picture's
// ncols x nrows pixels is centred on its node. The node extent used to be handed over as it was, so the picture was drawn one cell
// narrower and lower than the grid and its edges sat half a cell inside (200 m on a 400 m compilation grid): the error #560 removed
// for PixelIsPoint GeoTIFFs. The kept values (makeValueGrid, node-based) were never off.
export function nodeGridAreaBbox(x0, y0, dx, dy, ncols, nrows) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  return [x0 - ax / 2, y0 - ay / 2, x0 + dx * (ncols - 1) + ax / 2, y0 + dy * (nrows - 1) + ay / 2];
}

// GXF text -> the rows rowsPicture takes (raster.js parseGXF's body, unchanged; it throws the same messages)
export function gxfRows(text, name) {
  const lines = text.split(/\r\n|\r|\n/);

  const header = {}; // KEYWORD -> array of value lines
  let gridStart = -1;
  let curKey = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      const key = trimmed.slice(1).trim().toUpperCase();
      if (key === "GRID") { gridStart = i + 1; break; }
      curKey = key;
      header[curKey] = [];
    } else if (curKey && trimmed !== "") {
      header[curKey].push(trimmed);
    }
  }
  if (gridStart < 0) throw new Error(tr("Not a readable GXF file — no #GRID section found."));

  const num = (key, fallback) => {
    const v = header[key]?.[0] !== undefined ? parseFloat(header[key][0]) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };
  const ncols = num("POINTS", NaN), nrows = num("ROWS", NaN);
  if (!Number.isFinite(ncols) || !Number.isFinite(nrows) || ncols < 2 || nrows < 2) {
    throw new Error(tr("This GXF file is missing #POINTS/#ROWS (grid dimensions) or they're invalid."));
  }
  const dx = num("PTSEPARATION", 1), dy = num("RWSEPARATION", dx);
  const x0 = num("XORIGIN", 0), y0 = num("YORIGIN", 0);
  const rotation = num("ROTATION", 0);
  const sense = num("SENSE", 1);
  const dummy = num("DUMMY", 1e32); // GXF's own documented default nodata sentinel when #DUMMY is absent

  // A rotated grid can't be represented as the axis-aligned bbox+image rectangle the rest of the app's
  // raster drape model assumes (same assumption parseGeoTIFF's bbox makes) — rather than silently
  // draping it in the wrong place, surface this as an explicit limitation.
  if (Math.abs(rotation) > 0.01) {
    throw new Error(tr("This GXF grid has a #ROTATION of {rotation}° — rotated grids aren't supported yet (the raster drape only handles axis-aligned grids). Re-export it unrotated if your software supports that, or open it in GIS software first to reproject/re-grid to north-up.", { rotation }));
  }

  const total = ncols * nrows;
  const values = new Float64Array(total);
  let filled = 0;
  let gridCharCount = 0, gridDigitCount = 0; // see the shortfall diagnostic below
  for (let i = gridStart; i < lines.length && filled < total; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    gridCharCount += trimmed.length;
    for (let c = 0; c < trimmed.length; c++) { const ch = trimmed.charCodeAt(c); if (ch >= 48 && ch <= 57) gridDigitCount++; }
    const toks = trimmed.split(/\s+/);
    for (const t of toks) {
      if (filled >= total) break;
      const v = parseFloat(t);
      values[filled++] = Number.isFinite(v) ? v : dummy;
    }
  }
  if (filled < total) {
    // A shortfall this parser can't explain by truncation alone (see #164's UBC streaming work for a
    // genuinely truncated-file case) shows a telltale sign: plain-ASCII GXF grids are >20% digit
    // characters by nature (numbers, decimal points, minus signs, whitespace); a #GRID section with
    // almost no digit characters at all despite a substantial byte count isn't a short/truncated read
    // — it's data this parser can't interpret as text in the first place. Confirmed against a real
    // Geosoft export (CRN_VPMg_MagSusc_700.gxf) whose #GRID section is dense printable-ASCII with ZERO
    // digit characters — almost certainly a proprietary/undocumented Geosoft "compressed" GXF grid
    // encoding this from-scratch parser was never built against (there's no public spec for it, and
    // guessing at the bit-packing risked silently corrupting real geophysics data, so this wasn't
    // reverse-engineered blindly this pass — see TASKS.csv #166).
    // Calibrated against a real plain-text GXF grid (space-separated signed decimals are comfortably
    // 60-90% digit characters) vs. the real compressed sample below (~12%) — 0.3 cleanly separates them
    // with margin on both sides.
    const digitRatio = gridCharCount > 0 ? gridDigitCount / gridCharCount : 0;
    if (gridCharCount > 1000 && digitRatio < 0.3) {
      throw new Error(
        tr("This GXF's #GRID section doesn't look like plain-text numbers (only {v}% digit characters across {gridCharCount} characters read) — it's very likely using a proprietary/compressed Geosoft grid encoding this reader doesn't support, not a truncated file. If your workflow already exported this same grid as a GeoTIFF (.tif), import that instead — it carries the same data and is fully supported. Otherwise, re-export from Oasis montaj as an uncompressed/plain-text .gxf if that option is available.", { v: (digitRatio * 100).toFixed(1), gridCharCount: gridCharCount.toLocaleString() })
      );
    }
    throw new Error(tr("This GXF's #GRID section has fewer values ({filled}) than #POINTS×#ROWS ({total}) declares — the file may be truncated.", { filled, total }));
  }

  // SENSE controls how the flat value list maps onto rows/columns. GXF's most common cases: 1 = each
  // row read west->east, rows ordered south->north (the default almost every export uses); -1 = same
  // row order but each row mirrored east->west. The rarer transpose variants (±2) aren't handled —
  // falls back to SENSE=1 layout with a note in the returned message rather than misinterpreting the
  // data silently, since there's no public real-world sample of those variants to verify against.
  const mirrored = sense === -1;
  const senseNote = (sense !== 1 && sense !== -1) ? ` Note: #SENSE ${sense} (a transpose variant) isn't specifically handled — the grid was read as if SENSE were 1, so double-check its orientation looks right.` : "";

  return { name, values, ncols, nrows, x0, y0, dx, dy, dummy, mirrored, withGrid: sense === 1 || sense === -1, note: senseNote || null };
}

// TASKS.csv #1347 — Geosoft (Oasis montaj; compressed or not) and Surfer 6 / 7 binary grids (lib/grdFormats.js), as a raster drape
// with its values, like a GXF. A rotated grid is refused as the GXF reader refuses one. bytes -> the rows rowsPicture takes
export async function grdRows(bytes, name) {
  const g = await decodeGrd(bytes, (u8) => inflateCapped(u8, "deflate", 512 * MB, name)); // zlib streams, with a ceiling (#351)
  if (Math.abs(g.rotation || 0) > 0.01) throw new Error(tr("This {kind} grid is rotated by {rotation}° — rotated grids aren't supported yet (the raster drape only handles axis-aligned grids). Re-export it unrotated, or as a GeoTIFF.", { kind: g.kind, rotation: g.rotation }));
  if (!(g.ncols >= 2 && g.nrows >= 2)) throw new Error(tr("This grid has fewer than 2 x 2 nodes."));
  const note = " " + tr("Read as a {kind} grid ({type}{v}), {nx} × {ny} nodes at {dx} m.", { kind: g.kind, type: g.elementType, v: g.compressed ? tr(", compressed") : "", nx: g.ncols, ny: g.nrows, dx: +g.dx.toPrecision(4) });
  return { name, values: g.values, ncols: g.ncols, nrows: g.nrows, x0: g.x0, y0: g.y0, dx: g.dx, dy: g.dy, dummy: null, mirrored: false, withGrid: true, note };
}

// TASKS.csv #1347 — the drape image, the stretch and the value grid of a grid whose rows run south -> north (each west -> east, or
// east -> west when `mirrored`), shared by the GXF reader and the Geosoft / Surfer .grd reader. -> parseGeoTIFF's shape without the
// dataUrl (the caller encodes `rgba` as a PNG: a canvas, or an OffscreenCanvas in the worker)
// dummy: the GXF's no-data value (null: only non-finite values are no-data, as for a .grd)
export function rowsPicture({ name, values, ncols, nrows, x0, y0, dx, dy, dummy = null, mirrored = false, withGrid = true, note = null }) {
  const isDummy = dummy == null ? (v) => !Number.isFinite(v) : (v) => v === dummy || !Number.isFinite(v);
  const total = ncols * nrows;
  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(ncols, nrows));
  const outW = Math.max(1, Math.round(ncols * scale)), outH = Math.max(1, Math.round(nrows * scale));

  let min = Infinity, max = -Infinity, nValid = 0;
  for (let i = 0; i < total; i++) { const v = values[i]; if (!isDummy(v)) { if (v < min) min = v; if (v > max) max = v; nValid++; } }
  // TASKS.csv #3142 — the valid values in a Float64Array (it was a JS array grown by push: 4 million entries on a 2000 x 2000 grid)
  const valid = new Float64Array(nValid);
  for (let i = 0, k = 0; i < total; i++) { const v = values[i]; if (!isDummy(v)) valid[k++] = v; }
  const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const gxfStretch = stretchP298(valid); // #708 — as single-band GeoTIFFs and IDW grids (makeStretch(valid, "p2-98"), without its sort: #3142)

  const rgba = new Uint8ClampedArray(outW * outH * 4);
  // gxfRow 0 = south edge per SENSE=1 convention; canvas row 0 must be the north edge (top of image),
  // same top-down convention parseGeoTIFF/parseDEM already produce — so canvas row = (nrows-1-gxfRow),
  // then downsampled by nearest-neighbor onto the (possibly smaller) output grid.
  for (let oy = 0; oy < outH; oy++) {
    const gxfRow = Math.min(nrows - 1, Math.floor(((outH - 1 - oy) / Math.max(1, outH - 1)) * (nrows - 1)));
    for (let ox = 0; ox < outW; ox++) {
      let col = Math.min(ncols - 1, Math.floor((ox / Math.max(1, outW - 1)) * (ncols - 1)));
      if (mirrored) col = ncols - 1 - col;
      const v = values[gxfRow * ncols + col];
      const idx = (oy * outW + ox) * 4;
      if (isDummy(v)) { rgba[idx + 3] = 0; continue; }
      const t = hasRange ? gxfStretch.t(v) : 0.5; // #708
      const [cr, cg, cb] = pictureColour(t);
      rgba[idx] = cr; rgba[idx + 1] = cg; rgba[idx + 2] = cb; rgba[idx + 3] = 255;
    }
  }

  const bbox = nodeGridAreaBbox(x0, y0, dx, dy, ncols, nrows);
  // #326 — the values, north row first (GXF SENSE=1 lists rows south->north, each west->east)
  let grid = null;
  if (withGrid) {
    const northFirst = new Float64Array(total);
    for (let r = 0; r < nrows; r++) for (let c = 0; c < ncols; c++) {
      const src = values[r * ncols + (mirrored ? ncols - 1 - c : c)];
      northFirst[(nrows - 1 - r) * ncols + c] = src;
    }
    grid = makeValueGrid(northFirst, ncols, nrows, x0, y0 + dy * (nrows - 1), dx, dy, isDummy);
  }
  return {
    record: {
      grid, // #326
      name,
      bbox,
      width: ncols,
      height: nrows,
      stretch: { mode: gxfStretch.mode, lo: gxfStretch.lo, hi: gxfStretch.hi }, // #708
      bandCount: 1,
      epsgTag: null, // GXF headers don't carry a standard CRS tag the way GeoTIFF's GeoKeys do
      note,
    },
    rgba, outW, outH,
  };
}
