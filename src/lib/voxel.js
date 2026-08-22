import { getCol } from "./layers.js";

// TASKS.csv #27/#28 — voxel / block model import + shared rendering data prep.
//
// UBC-GIF mesh/model format (#28) — a genuinely public, documented tensor-mesh format used by the
// UBC-GIF geophysical inversion codes (MAG3D, GRAV3D, DCIP3D) and independently re-documented by
// SimPEG (github.com/simpeg/simpeg — discretize.TensorMesh readUBC/writeUBC), unlike Geosoft's own
// binary formats. Parsed here:
//   .msh — line 1 "NX NY NZ", line 2 "X0 Y0 Z0" (the mesh's top-south-west corner), then NX/NY/NZ
//   cell-width lines, each a plain space-separated list of widths and/or compact "count*width"
//   tokens (both forms appear in real exports).
//   .mod/.con/.den (model) — a flat list of NX*NY*NZ numeric values, one mesh cell each.
//
// IMPORTANT — value ordering is the one part of this format that genuinely varies in how confidently
// it's documented across tools that write it, and this parser got it wrong on its first pass: it
// originally assumed x-fastest/then-z/then-y based on SimPEG discretize's prose docs, which produced
// exactly the "scrambled/streaky" symptom this comment used to warn about, confirmed by a real user
// import (#170). Re-checked against discretize's own read_UBC/write_UBC SOURCE CODE (not just prose)
// — the real file order is z fastest (counted from the mesh's BOTTOM upward), then x, then y slowest.
// parseUBCModel/parseUBCModelStream now reorder into x-fastest/then-z/then-y (top-down z) immediately
// after reading — see reorderUBCValues right above parseUBCModel — so ubcMeshToCells/coarsenUBCModel
// below still work against that canonical order unchanged. If a model ever looks scrambled again,
// this is still the first thing to re-verify — the model file spec is genuinely inconsistent enough
// across the tools that write it that a different exporter doing something else can't be ruled out.
//
// Geosoft's own .geosoft_voxel format (also #27) is NOT implemented — like raster.js's .grd, it's a
// proprietary format with no public specification to implement against responsibly. #27 is instead
// scoped to what actually gets a user to "see my block model in 3D": import a block-model CSV
// (x/y/z cell centroid + cell size + value), the de facto interchange format every major
// mine-planning package (Datamine, Micromine, Surpac, Vulcan, Leapfrog) can already export — more
// immediately useful day to day than a from-scratch Geosoft binary reader would be, and both share
// the same voxel renderer below regardless of which importer produced the cell list.
// Perf fix (user report: a real ~3.16M-cell OMF block model, coarsened down to the previous 250,000-
// cell budget, still froze the 3D view for tens of seconds on import — measured directly, not
// guessed: the JS-side cell loop itself was fast, ~300ms for 200,000 cells, so nearly all of that
// time was the GPU/render side actually drawing that many InstancedMesh instances). Lowered to a more
// conservative budget so a coarsened import stays responsive; still comfortably enough resolution for
// visual inspection of overall structure — re-import a coarser mesh from the source tool for full
// original detail.
export const MAX_CELLS = 100000; // guards the 3D view from an accidental multi-million-cell import hanging the renderer
const NODATA_MAX = -1e10; // UBC-GIF codes use various no-data sentinels (-99999, -999, -1e30…) — anything this extreme is treated as no-data
const COARSEN_NODATA_SENTINEL = -1e30; // below NODATA_MAX, so a coarse cell with zero contributing fine cells reads as no-data too

export function parseUBCMesh(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length && !l.startsWith("!"));
  if (lines.length < 5) {
    throw new Error("Not a recognizable UBC mesh file — expected at least 5 non-comment lines (dimensions, origin, then X/Y/Z cell-width lists). Only the plain tensor-mesh format is supported, not OcTree/unstructured UBC variants.");
  }
  const [nx, ny, nz] = lines[0].split(/\s+/).map(Number);
  if (![nx, ny, nz].every((v) => Number.isInteger(v) && v > 0)) {
    throw new Error(`Bad mesh dimensions on line 1: "${lines[0]}" — expected "NX NY NZ".`);
  }
  // TASKS.csv follow-up (user report, real UBC inversion mesh — 41,841,072 cells): this used to hard-
  // reject anything over MAX_CELLS with no path forward except re-exporting a coarser mesh from
  // whatever tool produced it, which a lot of users can't easily do (or the mesh IS the deliverable).
  // The size check moved to importUBC (GeophysicsModule.jsx), which now block-averages an oversized
  // mesh down to fit instead of refusing it outright — see coarsenUBCModel below. This function stays
  // a pure structural parser; it no longer enforces MAX_CELLS itself.
  const [x0, y0, z0] = lines[1].split(/\s+/).map(Number);
  if (![x0, y0, z0].every(Number.isFinite)) throw new Error(`Bad mesh origin on line 2: "${lines[1]}" — expected "X0 Y0 Z0".`);

  const allTokens = lines.slice(2).join(" ").split(/\s+/).filter(Boolean);
  let cursor = 0;
  // "count*width" tokens each expand to multiple cells, so widths are consumed greedily until `n`
  // are produced rather than just slicing `n` tokens.
  const takeWidths = (n) => {
    const widths = [];
    while (widths.length < n && cursor < allTokens.length) {
      const tok = allTokens[cursor++];
      const starIdx = tok.indexOf("*");
      if (starIdx > -1) {
        const count = parseInt(tok.slice(0, starIdx), 10);
        const width = parseFloat(tok.slice(starIdx + 1));
        for (let i = 0; i < count && widths.length < n; i++) widths.push(width);
      } else {
        const w = parseFloat(tok);
        if (Number.isFinite(w)) widths.push(w);
      }
    }
    return widths;
  };
  const dx = takeWidths(nx), dy = takeWidths(ny), dz = takeWidths(nz);
  if (dx.length !== nx || dy.length !== ny || dz.length !== nz) {
    throw new Error(`Could not read ${nx}+${ny}+${nz} cell widths from the file (got ${dx.length}/${dy.length}/${dz.length}) — the mesh may use a UBC variant this parser doesn't support.`);
  }
  return { nx, ny, nz, x0, y0, z0, dx, dy, dz };
}

// Fixed the same class of bug as omf.js's cell-order fix (#169) — user report, real 412×558×182 UBC
// mesh via a re-imported resistivity.omf/UBC pair: "omfs looking really good now. not the UBC" — the
// OMF fix didn't touch this importer at all, and the UBC-imported model still rendered as the same
// kind of flat horizontal-stripe artifact the OMF bug produced, i.e. the same SYMPTOM, a genuinely
// separate importer/format, so a separate root cause. This parser's own header comment had already
// flagged this exact ordering as the least-confidently-documented part of the format and the first
// thing to suspect if a model ever looked "scrambled/streaky" — that suspicion turned out to be
// correct. Verified against the ACTUAL source code of SimPEG's discretize library (the independent
// reference this parser cites), not just its prose docs: discretize/mixins/mesh_io.py's read_UBC
// does `model = np.reshape(raw, (nCz, nCx, nCy), order="F"); model = model[::-1, :, :]; model =
// np.transpose(model, (1, 2, 0))` — reshape with order="F" onto a (nCz, nCx, nCy)-shaped array means
// the FIRST listed axis (z) is what actually varies fastest in the flat file data, not x. The
// `[::-1]` on that same axis means the file's fastest-varying z index is counted from the BOTTOM of
// the mesh upward (file z-index 0 = deepest cell), the opposite of the top-down iz=0-is-top indexing
// this app's own z0-minus-offset elevation math already (correctly) assumes. reorderUBCValues below
// undoes exactly this: reads the file's actual z-fastest/then-x/then-y order and re-lays the values
// out in the x-fastest/then-z/then-y order ubcMeshToCells and coarsenUBCModel already expect (and
// were already correctly implemented for) — so neither of those functions needed any changes, only
// this one reordering step feeding into them.
function reorderUBCValues(values, nx, ny, nz) {
  const out = new Float64Array(nx * ny * nz);
  let idx = 0;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      for (let zf = 0; zf < nz; zf++) {
        const iz = nz - 1 - zf; // file's fastest z index counts from the bottom — flip to top-down
        out[ix + iz * nx + iy * nx * nz] = values[idx++];
      }
    }
  }
  return out;
}

export function parseUBCModel(text, mesh) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const values = tokens.map(Number);
  const expected = mesh.nx * mesh.ny * mesh.nz;
  if (values.length !== expected) {
    throw new Error(mismatchMessage(values.length, expected, mesh, 0));
  }
  if (values.some((v) => !Number.isFinite(v))) {
    throw new Error("Model file contains a non-numeric token — check for a stray header/footer line.");
  }
  return reorderUBCValues(values, mesh.nx, mesh.ny, mesh.nz); // see reorderUBCValues — file order is z-fastest(from bottom)/then-x/then-y; this returns the x-fastest/then-z/then-y order the rest of this module expects
}

function mismatchMessage(gotCount, expected, mesh, fileSize) {
  let msg = `Model file has ${gotCount.toLocaleString()} value(s) but the mesh expects ${expected.toLocaleString()} (${mesh.nx}×${mesh.ny}×${mesh.nz}) — this model doesn't match the selected mesh.`;
  // User report (real 622MB UBC model file, on a OneDrive-synced folder): parseUBCModel came back with
  // 0 values even though the file's own listed size was correct (600MB+). A file this large that reads
  // as completely empty content, despite having a real non-zero size on disk, is a strong signal the
  // read itself failed rather than the file genuinely being empty — most likely a cloud-storage
  // "Files On-Demand" placeholder (OneDrive/Dropbox/Google Drive) that hasn't actually been downloaded
  // to this machine yet, so the local read returns nothing even though Explorer shows the real size.
  if (gotCount === 0 && fileSize > 1024 * 1024) {
    msg += ` The file itself is ${(fileSize / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 0 })} MB, so getting 0 values back usually means the read itself failed rather than the file being empty — if this file lives in OneDrive/Dropbox/Google Drive, it may be a "cloud-only" placeholder that hasn't actually downloaded to this machine yet. Right-click it and choose "Always keep on this device" (or the equivalent for your sync tool), wait for the download to finish, then try importing again.`;
  }
  return msg;
}

// Streaming variant for large model files (a real UBC-GIF inversion model can be 500MB+ of plain-text
// numbers). Reading the whole file into one JS string via File.text() first (the original approach)
// means holding the full text AND the full tokenized array in memory at once — unnecessary peak memory
// for a file this size, and, per the OneDrive investigation above, gives no visibility into whether the
// read itself is actually progressing. This reads the file as a stream of text chunks instead, tracking
// a running token count and writing straight into a pre-sized Float64Array (no huge intermediate string
// array of number-strings), reporting progress via onProgress(tokensReadSoFar) as it goes.
export async function parseUBCModelStream(file, mesh, onProgress) {
  const expected = mesh.nx * mesh.ny * mesh.nz;
  const values = new Float64Array(expected);
  let count = 0;
  let leftover = "";
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let lastReport = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = leftover + value;
      const endsWithWs = /\s$/.test(chunk);
      const parts = chunk.split(/\s+/).filter(Boolean);
      const complete = endsWithWs ? parts : parts.slice(0, -1);
      leftover = endsWithWs ? "" : (chunk.match(/\S+$/)?.[0] || "");
      for (const tok of complete) {
        if (count < expected) values[count] = Number(tok);
        count++;
      }
      if (onProgress && count - lastReport > 500000) { onProgress(count); lastReport = count; }
    }
  } finally {
    reader.releaseLock?.();
  }
  if (leftover) {
    if (count < expected) values[count] = Number(leftover);
    count++;
  }
  if (count !== expected) {
    throw new Error(mismatchMessage(count, expected, mesh, file.size || 0));
  }
  for (let i = 0; i < expected; i++) {
    if (!Number.isFinite(values[i])) throw new Error("Model file contains a non-numeric token — check for a stray header/footer line.");
  }
  // See reorderUBCValues (above parseUBCModel) — same file-order-to-canonical-order fix (#170), applied
  // here too so a large streamed model is reordered identically to a small synchronously-read one.
  return reorderUBCValues(values, mesh.nx, mesh.ny, mesh.nz);
}

// Converts a parsed UBC mesh + its flat value array into world-space cells {x,y,z (center),
// dx,dy,dz, value}, skipping no-data cells. z is elevation (mesh z0 is the TOP, cells extend down).
export function ubcMeshToCells(mesh, values) {
  const { nx, ny, nz, x0, y0, z0, dx, dy, dz } = mesh;
  const xOff = []; { let c = 0; for (let i = 0; i < nx; i++) { xOff.push(c + dx[i] / 2); c += dx[i]; } }
  const yOff = []; { let c = 0; for (let i = 0; i < ny; i++) { yOff.push(c + dy[i] / 2); c += dy[i]; } }
  const zOff = []; { let c = 0; for (let i = 0; i < nz; i++) { zOff.push(c + dz[i] / 2); c += dz[i]; } }
  const cells = [];
  let idx = 0;
  // Order matches parseUBCModel's documented value ordering: x fastest, then z, then y.
  for (let iy = 0; iy < ny; iy++) {
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const v = values[idx++];
        if (Number.isFinite(v) && v > NODATA_MAX) {
          cells.push({ x: x0 + xOff[ix], y: y0 + yOff[iy], z: z0 - zOff[iz], dx: dx[ix], dy: dy[iy], dz: dz[iz], value: v });
        }
      }
    }
  }
  return cells;
}

// TASKS.csv follow-up (user report: importing a real UBC-GIF inversion mesh — 41,841,072 cells — hit
// the flat MAX_CELLS reject with no way forward). planCoarsenFactors picks a per-axis block-averaging
// factor (fx,fy,fz — merge fx adjacent X cells into 1, etc.) that brings the mesh under budget,
// greedily shrinking whichever axis currently has the most coarse cells so the reduction stays
// balanced across axes rather than collapsing one dimension first. coarsenUBCModel then actually
// builds the reduced mesh + value array: new cell widths are the SUM of the fine widths they replace
// (so the coarse mesh still covers the exact same real-world volume), and each coarse cell's value is
// the mean of its contributing fine cells' values, no-data cells excluded from the average (a coarse
// cell with zero data-bearing fine cells underneath it is itself marked no-data via
// COARSEN_NODATA_SENTINEL, rather than silently averaging in a no-data sentinel value as if it were
// real data).
export function planCoarsenFactors(nx, ny, nz, maxCells = MAX_CELLS) {
  let fx = 1, fy = 1, fz = 1;
  const total = () => Math.ceil(nx / fx) * Math.ceil(ny / fy) * Math.ceil(nz / fz);
  let guard = 0;
  while (total() > maxCells && guard++ < 100000) {
    const cx = Math.ceil(nx / fx), cy = Math.ceil(ny / fy), cz = Math.ceil(nz / fz);
    if (cx >= cy && cx >= cz) fx++;
    else if (cy >= cz) fy++;
    else fz++;
  }
  return { fx, fy, fz };
}

export function coarsenUBCModel(mesh, values, fx, fy, fz) {
  const { nx, ny, nz, x0, y0, z0, dx, dy, dz } = mesh;
  if (fx <= 1 && fy <= 1 && fz <= 1) return { mesh, values };
  const cnx = Math.ceil(nx / fx), cny = Math.ceil(ny / fy), cnz = Math.ceil(nz / fz);
  const groupWidths = (widths, f, cn) => {
    const out = [];
    for (let c = 0; c < cn; c++) {
      let sum = 0;
      for (let i = c * f; i < Math.min(widths.length, (c + 1) * f); i++) sum += widths[i];
      out.push(sum);
    }
    return out;
  };
  const cdx = groupWidths(dx, fx, cnx), cdy = groupWidths(dy, fy, cny), cdz = groupWidths(dz, fz, cnz);

  const cellCount = cnx * cny * cnz;
  const sums = new Float64Array(cellCount);
  const counts = new Int32Array(cellCount);
  let idx = 0;
  // Same x-fastest/then-z/then-y order as ubcMeshToCells reads `values` in — see parseUBCModel's
  // header comment. The coarse flat index below uses the identical convention so the aggregated
  // array can be fed straight back into ubcMeshToCells unchanged.
  for (let iy = 0; iy < ny; iy++) {
    const cy = Math.floor(iy / fy);
    for (let iz = 0; iz < nz; iz++) {
      const cz = Math.floor(iz / fz);
      for (let ix = 0; ix < nx; ix++) {
        const v = values[idx++];
        if (Number.isFinite(v) && v > NODATA_MAX) {
          const cx = Math.floor(ix / fx);
          const cidx = cx + cz * cnx + cy * cnx * cnz;
          sums[cidx] += v;
          counts[cidx]++;
        }
      }
    }
  }
  const coarseValues = new Array(cellCount);
  for (let i = 0; i < cellCount; i++) coarseValues[i] = counts[i] ? sums[i] / counts[i] : COARSEN_NODATA_SENTINEL;

  return { mesh: { nx: cnx, ny: cny, nz: cnz, x0, y0, z0, dx: cdx, dy: cdy, dz: cdz }, values: coarseValues };
}

// Block-model CSV import (#27's pragmatic substitute for a proprietary Geosoft voxel reader — see
// this module's header comment). Accepts either an explicit per-axis cell size (dx/dy/dz, or a
// single common `size`) or infers a uniform size from the smallest gap between distinct centroid
// values along each axis (the standard "regular block model" case — most exports are a uniform
// grid). Column name matching reuses layers.js's getCol (case-insensitive, trims header whitespace)
// so it accepts the same easting/northing/elevation-style synonyms the rest of the app already does.
export function parseBlockModelCSV(rows) {
  const parsed = rows.map((r) => ({
    x: Number(getCol(r, ["x", "xc", "centroid_x", "easting", "east"])),
    y: Number(getCol(r, ["y", "yc", "centroid_y", "northing", "north"])),
    z: Number(getCol(r, ["z", "zc", "centroid_z", "elevation", "elev"])),
    dx: Number(getCol(r, ["dx", "xinc", "size_x", "xdim", "size"])),
    dy: Number(getCol(r, ["dy", "yinc", "size_y", "ydim", "size"])),
    dz: Number(getCol(r, ["dz", "zinc", "size_z", "zdim", "size"])),
    value: Number(getCol(r, ["value", "val", "grade", "au", "cu", "assay"])),
  }));
  const good = parsed.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z) && Number.isFinite(r.value));
  const bad = parsed.length - good.length;

  // If cell size columns weren't found/usable for some rows, infer a uniform size per axis from the
  // smallest spacing between distinct centroid coordinates on that axis — a block model's centroids
  // form a regular lattice in the common case, so the minimum gap IS the cell size.
  const inferAxis = (key) => {
    const missing = good.some((r) => !Number.isFinite(r[key]) || r[key] <= 0);
    if (!missing) return null;
    const vals = Array.from(new Set(good.map((r) => r[key === "dx" ? "x" : key === "dy" ? "y" : "z"]))).sort((a, b) => a - b);
    let minGap = Infinity;
    for (let i = 1; i < vals.length; i++) minGap = Math.min(minGap, vals[i] - vals[i - 1]);
    return Number.isFinite(minGap) && minGap > 0 ? minGap : 1; // 1 world-unit fallback if every centroid collapses onto one value (e.g. a single-cell test file)
  };
  const inferredDx = inferAxis("dx"), inferredDy = inferAxis("dy"), inferredDz = inferAxis("dz");
  const cells = good.map((r) => ({
    x: r.x, y: r.y, z: r.z,
    dx: Number.isFinite(r.dx) && r.dx > 0 ? r.dx : inferredDx,
    dy: Number.isFinite(r.dy) && r.dy > 0 ? r.dy : inferredDy,
    dz: Number.isFinite(r.dz) && r.dz > 0 ? r.dz : inferredDz,
    value: r.value,
  }));
  if (cells.length > MAX_CELLS) {
    throw new Error(`CSV has ${cells.length.toLocaleString()} usable rows — over GeoStrix's ${MAX_CELLS.toLocaleString()}-cell import limit (kept low enough to stay responsive in the 3D view).`);
  }
  return { cells, badRows: bad, inferredSize: (inferredDx !== null || inferredDy !== null || inferredDz !== null) };
}

// Bug found while testing the UBC-mesh coarsening fix above (real repro: a 432,000-cell import hit
// "Maximum call stack size exceeded"): Math.min(...vals)/Math.max(...vals) spreads the WHOLE array as
// individual call arguments, which blows the JS engine's argument-count limit well under GeoStrix's
// own MAX_CELLS budget (V8's ceiling is in the ~65k-125k range depending on build/stack depth, so
// this broke on any import with more rows/cells than that — silently fine for small imports, a hard
// crash for anything large, exactly the kind of import this coarsening feature is meant to make work).
// A plain reduce loop has no such limit regardless of array size.
export function cellValueRange(cells) {
  let min = Infinity, max = -Infinity;
  for (const c of cells) {
    const v = c.value;
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return { min: 0, max: 1 };
  return { min, max };
}
