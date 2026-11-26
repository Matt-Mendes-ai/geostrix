// TASKS.csv #4078 — a Res3DInv inversion file (.inv, Geotomo): the IP / resistivity readings, then (once inverted) the model blocks and, per
// iteration, the resistivity MODEL and the IP MODEL by layer. Found in SARIG's Hillside report (a 3D pole-dipole survey inverted to 19
// layers of 34 × 102 blocks); side 1's harvest probe saw it as "a UBC model that returned nothing". Read here as block models: the LAST
// iteration's resistivity (ohm·m) and chargeability (the unit the file states, mV/V there), on the blocks the file lists.
// The layout read (non-uniform grid, as Res3DInv writes it):
//   title / nx grid lines / ny grid lines / "Nonuniform grid" / "X-location of grid-lines" + values / "Y-location ..." + values / array type /
//   ... / "IP present" / quantity ("Chargeability") / unit ("mV/V") / ... the readings ... / layer count / layer depths /
//   "Coordinates of blocks" / "Layer k" / "nbx nby" / "Block n" + its 8 corners (x y depth) ... / "MODEL" / "LAYER k" + values ... / "IP MODEL" ...
// Depths are below the ground: the file holds no elevation, so the top is drawn at 0 m and the note says so. Some contractors write the
// northing as X (Hillside: X 6.17 M, Y 762 k): a UTM-looking pair is swapped back, and said.
import { t as tr } from "./i18n.js";

const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const numsOf = (line) => String(line || "").trim().split(/\s+/).filter(Boolean).map(Number);

// the file's head (a few KB is enough): title, two grid-line counts, then a grid line ("Nonuniform grid")
export function isRes3dinvText(text) {
  const l = String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return l.length >= 4 && /^\d+$/.test(l[1]) && /^\d+$/.test(l[2]) && /^(non-?uniform|uniform) grid$/i.test(l[3]);
}

export function parseRes3dinvModel(text) {
  const lines = String(text || "").split(/\r?\n/).map((s) => s.trim());
  // the model part not in the layout read here: the line it stopped at, as the file numbers it
  const bad = (k) => new Error(tr("Not the Res3DInv model layout GeoStrix reads (line {n}).", { n: (k + 1).toLocaleString() }));
  const at = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };
  const bi = at(/^Coordinates of blocks$/i);
  if (bi < 0) throw new Error(tr("No inverted model in this file: open the .inv saved after the inversion."));
  // the IP quantity and unit the head states ("IP present", "Chargeability", "mV/V")
  const ipAt = at(/^IP present$/i);
  const ipQuantity = ipAt >= 0 ? lines[ipAt + 1] || "" : "", ipUnit = ipAt >= 0 ? lines[ipAt + 2] || "" : "";
  // the blocks, layer by layer
  const layers = [];
  let i = bi + 1;
  while (i < lines.length && /^Layer\s+\d+$/i.test(lines[i])) {
    const [nbx, nby] = numsOf(lines[i + 1]);
    if (!(Number.isInteger(nbx) && Number.isInteger(nby) && nbx > 0 && nby > 0)) throw bad(i + 1);
    const n = nbx * nby, box = { nbx, nby, x0: new Float64Array(n), x1: new Float64Array(n), y0: new Float64Array(n), y1: new Float64Array(n), z0: new Float64Array(n), z1: new Float64Array(n) };
    i += 2;
    for (let b = 0; b < n; b++) {
      if (!/^Block\s+\d+$/i.test(lines[i])) throw bad(i);
      let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity, za = Infinity, zb = -Infinity;
      for (let c = 1; c <= 8; c++) {
        const [x, y, z] = numsOf(lines[i + c]);
        if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) throw bad(i + c);
        if (x < xa) xa = x; if (x > xb) xb = x; if (y < ya) ya = y; if (y > yb) yb = y; if (z < za) za = z; if (z > zb) zb = z;
      }
      box.x0[b] = xa; box.x1[b] = xb; box.y0[b] = ya; box.y1[b] = yb; box.z0[b] = za; box.z1[b] = zb;
      i += 9;
    }
    layers.push(box);
  }
  if (!layers.length) throw bad(bi + 1);
  // the last iteration's MODEL, and the IP MODEL that follows it
  let mi = -1, iterations = 0;
  for (let k = i; k < lines.length; k++) if (lines[k] === "MODEL") { mi = k; iterations++; }
  if (mi < 0) throw new Error(tr("No inverted model in this file: open the .inv saved after the inversion."));
  const readSection = (start) => {
    const total = layers.reduce((s, L) => s + L.nbx * L.nby, 0), out = new Float64Array(total);
    let k = start + 1, o = 0;
    for (let li = 0; li < layers.length; li++) {
      if (!new RegExp(`^LAYER\\s+${li + 1}$`, "i").test(lines[k] || "")) throw bad(k);
      k++;
      const want = o + layers[li].nbx * layers[li].nby;
      while (o < want && k < lines.length) {
        for (const tok of lines[k].split(/\s+/)) { if (!tok) continue; if (!NUM.test(tok)) throw bad(k); if (o < want) out[o++] = Number(tok); }
        k++;
      }
      if (o < want) throw bad(k);
    }
    return out;
  };
  const resistivity = readSection(mi);
  const ii = at(/^IP MODEL$/, mi + 1);
  const ip = ii >= 0 ? readSection(ii) : null;
  return { layers, resistivity, ip, ipQuantity, ipUnit, iterations };
}

// a UTM-looking pair written the other way round: X near 6 million (a northing), Y in the hundreds of thousands (an easting)
export function looksNorthingFirst(x, y) { return x >= 1e6 && x < 1e7 && y >= 1e5 && y < 1e6; }

const edgesOf = (lo, hi) => { const e = [...new Set([...lo, ...hi].map((v) => +v.toFixed(6)))].sort((a, b) => a - b); return e; };
// -> a UBC-style tensor mesh { nx, ny, nz, x0, y0, z0: 0, dx, dy, dz } and the values in voxel.js's order (x fastest, then z from the top, then y),
// when every layer has the same blocks in plan (Hillside's do); null otherwise
export function res3dinvTensor(parsed) {
  const L0 = parsed.layers[0];
  const same = parsed.layers.every((L) => L.nbx === L0.nbx && L.nby === L0.nby && L.x0.every((v, b) => v === L0.x0[b] && L.x1[b] === L0.x1[b] && L.y0[b] === L0.y0[b] && L.y1[b] === L0.y1[b]));
  if (!same) return null;
  const xe = edgesOf(L0.x0, L0.x1), ye = edgesOf(L0.y0, L0.y1);
  if (xe.length !== L0.nbx + 1 || ye.length !== L0.nby + 1) return null;
  const swap = looksNorthingFirst((xe[0] + xe[xe.length - 1]) / 2, (ye[0] + ye[ye.length - 1]) / 2);
  const ex = swap ? ye : xe, ey = swap ? xe : ye;
  const nx = ex.length - 1, ny = ey.length - 1, nz = parsed.layers.length;
  const dz = parsed.layers.map((L) => L.z1[0] - L.z0[0]);
  const mesh = { nx, ny, nz, x0: ex[0], y0: ey[0], z0: 0, dx: ex.slice(1).map((v, i) => v - ex[i]), dy: ey.slice(1).map((v, i) => v - ey[i]), dz };
  const per = L0.nbx * L0.nby;
  const order = (vals) => {
    if (!vals) return null;
    const out = new Float64Array(nx * ny * nz);
    for (let iz = 0; iz < nz; iz++) for (let b = 0; b < per; b++) {
      const fx = b % L0.nbx, fy = Math.floor(b / L0.nbx); // the file's blocks: its X fastest, then its Y
      const ix = swap ? fy : fx, iy = swap ? fx : fy;
      out[ix + iz * nx + iy * nx * nz] = vals[iz * per + b];
    }
    return out;
  };
  return { mesh, resistivity: order(parsed.resistivity), ip: order(parsed.ip), swapped: swap, depth: dz.reduce((s, v) => s + v, 0) };
}

// the property label a block model carries ("Values are"), with its unit: chargeability in mV/V is the list's own; another unit stays in the name
export function res3dinvIpProperty(quantity, unit) {
  return /charg/i.test(quantity || "") && /^mv\/v$/i.test(String(unit || "").trim()) ? "Chargeability (mV/V)" : null;
}
