// TASKS.csv #1967 — a true 3D DC / IP survey from its raw readings: a contractor export whose electrodes carry world
// coordinates (SJ Geophysics' C1/C2/P1/P2 _E/_N/_Z columns: offline diamond dipoles, fixed remote current electrodes), turned
// into the request of the existing 3D engine (python-sidecar app/geophys/dcip3d.py). The line-based route (dcip3d.js) cannot
// take it: no reading of Kodiak's 2023 survey has P1 and P2 on one line. Pure: no React.
//
// Each reading's geometric factor comes from the file: G = P / Ra (P = Vp / I, the normalized potential), which on Kodiak matches
// the half-space factor of the surveyed electrode coordinates to within 0.5 % (median ratio 1.0001); diamond geometries make
// about half of them negative. Without a P column it is computed from the coordinates (half-space, 3D distances).
// Chargeability: SJ's Mx is in ms (the decay integrated over the window, 200-1800 ms at Kodiak). It is inverted as given by
// default, so the model compares with the contractor's (which is in the same units), or converted to mV/V (x 1000 / window ms).

const NUM = (s) => { const v = Number(s); return Number.isFinite(v) ? v : NaN; };
const ELECTRODES = ["C1", "C2", "P1", "P2"];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const keyOf = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

// The half-space geometric factor of one reading (1/AM - 1/AN - 1/BM + 1/BN) / 2 pi; B or N null = at infinity
export function halfSpaceFactor(a, b, m, n) {
  const inv = (p, q) => (p && q ? 1 / dist(p, q) : 0);
  return (inv(a, m) - inv(a, n) - inv(b, m) + inv(b, n)) / (2 * Math.PI);
}

// -> { ok, reason?, n, readings [[ax, ay, az, bx, by, bz, mx, my, mz, nx, ny, nz]] (B / N null when the file has no column),
//      rho, g, gFromFile (count), mx | null, rhoErr | null, mxErr | null, rhoDeleted | null, mxDeleted | null,
//      coords ("utm" | "local"), crsText, mxWindowMs [from, to] | null, electrodes, remotes [{ x, y, z, readings }], meta {} }
export function parseElectrodeArrayText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const hi = lines.findIndex((l) => /\bC1_(E|X)\b/.test(l) && /\bP1_(E|X)\b/.test(l));
  if (hi < 0) return { ok: false, reason: "no electrode coordinate columns (C1_E / C1_N / C1_Z, P1_E ...)" };
  const comma = lines[hi].includes(","), tab = lines[hi].includes("\t");
  const split = (l) => (comma ? l.split(",") : tab ? l.split("\t") : l.trim().split(/\s+/)).map((s) => s.trim());
  const H = split(lines[hi]);
  const col = (name) => { const i = H.findIndex((h) => h.toLowerCase() === name.toLowerCase()); return i; };
  const utm = col("C1_E") >= 0 && col("C1_N") >= 0;
  const [cx, cy] = utm ? ["_E", "_N"] : ["_X", "_Y"];
  const pos = Object.fromEntries(ELECTRODES.map((e) => [e, [col(e + cx), col(e + cy), col(e + "_Z")]]));
  if (pos.C1.some((i) => i < 0) || pos.P1.some((i) => i < 0)) return { ok: false, reason: "C1 and P1 need easting, northing and elevation (_E, _N, _Z) columns" };
  const iRa = [col("Ra"), col("Rho"), col("App_Res"), col("Rhoa")].find((i) => i >= 0) ?? -1;
  if (iRa < 0) return { ok: false, reason: "no apparent resistivity column (Ra)" };
  const iP = col("P"), iMx = col("Mx"), iRaErr = col("Ra_error"), iMxErr = [col("Mx_error_adjusted"), col("Mx_adjusted_error"), col("Mx_error")].find((i) => i >= 0) ?? -1;
  const iRaDel = col("Ra_deleted"), iMxDel = col("Mx_deleted");
  // the header block: "Key: value" lines before the column row
  const meta = {};
  for (const l of lines.slice(0, hi)) { const m = /^\s*([^:#][^:]{0,80}?)\s*:\s*(.+?)\s*$/.exec(l); if (m) meta[m[1]] = m[2]; }
  const wKey = Object.keys(meta).find((k) => /mx start-end time/i.test(k));
  const w = wKey ? /([\d.]+)\s*-\s*([\d.]+)/.exec(meta[wKey]) : null;
  const mxWindowMs = w ? [Number(w[1]), Number(w[2])] : null;
  const crsText = meta.Units || meta["Datum/Projection"] || null;

  const readings = [], rho = [], g = [], mx = [], rhoErr = [], mxErr = [], rhoDel = [], mxDel = [];
  let gFromFile = 0;
  for (const l of lines.slice(hi + 1)) {
    if (!l.trim()) continue;
    const r = split(l);
    if (r.length < H.length - 2) continue;
    const p = (e) => { const [ix, iy, iz] = pos[e]; if (ix < 0 || iy < 0) return null; const v = [NUM(r[ix]), NUM(r[iy]), iz >= 0 ? NUM(r[iz]) : NaN]; return v.every(Number.isFinite) ? v : null; };
    const A = p("C1"), B = p("C2"), M = p("P1"), Nn = p("P2");
    if (!A || !M) continue;
    const ra = NUM(r[iRa]);
    readings.push([...A, ...(B || [null, null, null]), ...M, ...(Nn || [null, null, null])]);
    rho.push(ra);
    const pp = iP >= 0 ? NUM(r[iP]) : NaN;
    if (Number.isFinite(pp) && Number.isFinite(ra) && ra !== 0 && pp !== 0) { g.push(pp / ra); gFromFile++; } else g.push(halfSpaceFactor(A, B, M, Nn));
    mx.push(iMx >= 0 ? NUM(r[iMx]) : NaN);
    rhoErr.push(iRaErr >= 0 ? NUM(r[iRaErr]) : NaN);
    mxErr.push(iMxErr >= 0 ? NUM(r[iMxErr]) : NaN);
    rhoDel.push(iRaDel >= 0 ? NUM(r[iRaDel]) === 1 : false);
    mxDel.push(iMxDel >= 0 ? NUM(r[iMxDel]) === 1 : false);
  }
  if (!readings.length) return { ok: false, reason: "no reading rows with C1 and P1 positions" };
  // electrodes; a current electrode well outside the receivers is a remote (still a real electrode at its coordinates)
  const all = new Map(), recv = [];
  for (const row of readings) for (let k = 0; k < 4; k++) { if (row[3 * k] == null) continue; const q = [row[3 * k], row[3 * k + 1], row[3 * k + 2]]; all.set(keyOf(q), q); if (k >= 2) recv.push(q); }
  const xs = recv.map((q) => q[0]), ys = recv.map((q) => q[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const dips = readings.filter((r) => r[9] != null).map((r) => Math.hypot(r[6] - r[9], r[7] - r[10])).sort((a, b) => a - b);
  const dipole = dips.length ? dips[dips.length >> 1] : 0;
  const remoteCount = new Map();
  for (const row of readings) for (const k of [0, 1]) {
    if (row[3 * k] == null) continue;
    const x = row[3 * k], y = row[3 * k + 1];
    const out = Math.hypot(Math.max(box[0] - x, 0, x - box[2]), Math.max(box[1] - y, 0, y - box[3]));
    if (out > 2 * Math.max(dipole, 1)) { const q = [x, y, row[3 * k + 2]]; const kk = keyOf(q); const e = remoteCount.get(kk) || { x, y, z: q[2], readings: 0, outsideM: Math.round(out) }; e.readings++; remoteCount.set(kk, e); }
  }
  const has = (arr) => arr.some((v) => Number.isFinite(v));
  return {
    ok: true, n: readings.length, readings, rho, g, gFromFile,
    mx: has(mx) ? mx : null, rhoErr: has(rhoErr) ? rhoErr : null, mxErr: has(mxErr) ? mxErr : null,
    rhoDeleted: iRaDel >= 0 ? rhoDel : null, mxDeleted: iMxDel >= 0 ? mxDel : null,
    coords: utm ? "utm" : "local", crsText, mxWindowMs, electrodes: all.size, receiverBox: box, dipoleM: Math.round(dipole),
    remotes: [...remoteCount.values()], meta,
  };
}

// The readings a run takes: a positive apparent resistivity, not removed by the contractor (honourDeleted), every `step`-th
// current-electrode pair. -> { idx, leftDeleted, leftNonPositive, currentPairs, keptPairs }
export function selectArrayReadings(parsed, { honourDeleted = true, step = 1 } = {}) {
  const pairKey = (r) => `${r[0]},${r[1]},${r[3]},${r[4]}`;
  let leftDeleted = 0, leftNonPositive = 0;
  const base = [];
  parsed.readings.forEach((r, i) => {
    if (honourDeleted && parsed.rhoDeleted?.[i]) { leftDeleted++; return; } // the contractor's own removals first (Kodiak: 971 of its 1,710 are negative)
    if (!(parsed.rho[i] > 0)) { leftNonPositive++; return; }
    base.push(i);
  });
  const pairs = [];
  for (const i of base) { const k = pairKey(parsed.readings[i]); if (!pairs.includes(k)) pairs.push(k); }
  const keep = new Set(pairs.filter((_, j) => j % Math.max(1, step) === 0));
  const idx = base.filter((i) => keep.has(pairKey(parsed.readings[i])));
  return { idx, leftDeleted, leftNonPositive, currentPairs: pairs.length, keptPairs: keep.size };
}

// A starting cell size and depth: the cell about half the receiver dipole (rounded to 5 m), the depth about two dipole lengths
// below the electrodes plus a little; these are starting points for the estimate, which decides what the computer can do
export function suggestArrayMesh(parsed) {
  const d = parsed.dipoleM || 100;
  return { core: Math.max(10, Math.round(d / 2 / 5) * 5), depth: Math.round(Math.max(100, 3 * d) / 10) * 10 };
}

// The engine request. ipUnits "ms" (as the file: comparable with the contractor's model) | "mVV" (x 1000 / window ms).
export function buildArrayRequest(parsed, idx, { core, depth, maxIter = 12, pct, floor, useFileErrors = true, useIp = true, honourIpDeleted = true, ipUnits = "ms", ipPct, ipFloor, terrain = null, terrainAt = null }) {
  const pick = (arr) => idx.map((i) => arr[i]);
  const readings = pick(parsed.readings), rho = pick(parsed.rho);
  const withIp = useIp && parsed.mx && idx.every((i) => Number.isFinite(parsed.mx[i]));
  const scale = ipUnits === "mVV" && parsed.mxWindowMs ? 1000 / Math.max(1, parsed.mxWindowMs[1] - parsed.mxWindowMs[0]) : 1;
  const topo = [];
  const seen = new Set();
  for (const r of readings) for (let k = 0; k < 4; k++) { if (r[3 * k] == null) continue; const kk = `${r[3 * k]},${r[3 * k + 1]}`; if (!seen.has(kk)) { seen.add(kk); topo.push([r[3 * k], r[3 * k + 1], r[3 * k + 2]]); } }
  let topoSkipped = 0;
  if (terrain && terrainAt) {
    const [x0, y0, x1, y1] = parsed.receiverBox, pad = 500, n = 40;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = x0 - pad + ((x1 - x0 + 2 * pad) * i) / n, y = y0 - pad + ((y1 - y0 + 2 * pad) * j) / n;
      const z = terrainAt(terrain, x, y);
      if (Number.isFinite(z)) topo.push([+x.toFixed(1), +y.toFixed(1), +z.toFixed(2)]); else topoSkipped++;
    }
  }
  const errPct = useFileErrors && parsed.rhoErr ? idx.map((i) => (Number.isFinite(parsed.rhoErr[i]) && parsed.rho[i] ? +(Math.abs(parsed.rhoErr[i] / parsed.rho[i]) * 100).toFixed(4) : null)) : null;
  const ipErr = withIp && useFileErrors && parsed.mxErr ? idx.map((i) => (Number.isFinite(parsed.mxErr[i]) ? +(Math.abs(parsed.mxErr[i]) * scale).toFixed(5) : null)) : null;
  const ipUse = withIp && honourIpDeleted && parsed.mxDeleted ? idx.map((i) => !parsed.mxDeleted[i]) : null;
  return {
    readings, chain: null, rho, geometricFactor: "perReading", geometricFactorPerReading: pick(parsed.g),
    ...(withIp ? { chargeability: idx.map((i) => +(parsed.mx[i] * scale).toFixed(5)) } : {}),
    ...(ipUse && ipUse.some((v) => !v) ? { ipUse } : {}),
    topo, ...(terrain ? { topoSkipped } : {}),
    mesh: { core: Number(core), depth: Number(depth) }, maxIter: Number(maxIter) || 12,
    uncertainty: { percent: Number(pct) || 0, floor: Number(floor) || 0, ...(errPct ? { floorPerReadingPercent: errPct } : {}) },
    ...(withIp ? { ipUncertainty: { percent: Number(ipPct) || 0, floor: Number(ipFloor) || 0, ...(ipErr ? { floorPerReadingMvV: ipErr } : {}) } } : {}),
  };
}

// The median of the file's own relative resistivity error (%), for the panel to quote
export function medianRelErrorPct(parsed, idx) {
  if (!parsed.rhoErr) return null;
  const v = idx.map((i) => Math.abs(parsed.rhoErr[i] / parsed.rho[i]) * 100).filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : null;
}

// TASKS.csv #1967 — compare a model with another loaded block model (the contractor's): at the first model's cell centres that fall
// inside a cell of the second (air / no-data cells left out), the rank correlation of the values (of their logs when `log`), the
// medians, and where each model's top 2 % sits. b's cells may be any rectilinear or octree set: found through a hash grid.
// -> { n, rank, medianA, medianB, topA {x, y, z}, topB {x, y, z}, offsetM {plan, vertical} } | null (fewer than 30 shared cells)
export function compareBlockModels(aCells, bCells, { log = false, minSupport = null } = {}) {
  const A = (aCells || []).filter((c) => Number.isFinite(c.value) && (minSupport == null || !(c.support < minSupport)));
  const B = (bCells || []).filter((c) => Number.isFinite(c.value));
  if (A.length < 30 || B.length < 30) return null;
  const sizes = B.map((c) => Math.max(c.dx, c.dy)).sort((p, q) => p - q);
  const bin = Math.max(1, sizes[sizes.length >> 1]);
  const grid = new Map(), k2 = (i, j) => `${i},${j}`;
  for (const c of B) {
    const i0 = Math.floor((c.x - c.dx / 2) / bin), i1 = Math.floor((c.x + c.dx / 2) / bin), j0 = Math.floor((c.y - c.dy / 2) / bin), j1 = Math.floor((c.y + c.dy / 2) / bin);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = k2(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(c); }
  }
  const inside = (c, p) => Math.abs(p.x - c.x) <= c.dx / 2 && Math.abs(p.y - c.y) <= c.dy / 2 && Math.abs(p.z - c.z) <= c.dz / 2;
  const pairs = [];
  for (const p of A) {
    const list = grid.get(k2(Math.floor(p.x / bin), Math.floor(p.y / bin))) || [];
    const c = list.find((q) => inside(q, p));
    if (!c) continue;
    const va = log ? Math.log10(p.value) : p.value, vb = log ? Math.log10(c.value) : c.value;
    if (Number.isFinite(va) && Number.isFinite(vb)) pairs.push([va, vb, p]);
  }
  if (pairs.length < 30) return null;
  const rank = (vals) => { const o = vals.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(vals.length); let i = 0; while (i < o.length) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const ra = rank(pairs.map((p) => p[0])), rb = rank(pairs.map((p) => p[1]));
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length, ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  const med = (v) => { const s = [...v].sort((p, q) => p - q); return s[s.length >> 1]; };
  const top = (which) => { const s = [...pairs].sort((p, q) => q[which] - p[which]).slice(0, Math.max(1, Math.floor(pairs.length * 0.02))); return { x: mean(s.map((p) => p[2].x)), y: mean(s.map((p) => p[2].y)), z: mean(s.map((p) => p[2].z)) }; };
  const tA = top(0), tB = top(1);
  const un = (v) => (log ? 10 ** v : v);
  return { n: pairs.length, rank: da && db ? num / Math.sqrt(da * db) : 0, medianA: un(med(pairs.map((p) => p[0]))), medianB: un(med(pairs.map((p) => p[1]))), topA: tA, topB: tB,
    offsetM: { plan: Math.hypot(tA.x - tB.x, tA.y - tB.y), vertical: tA.z - tB.z } };
}
