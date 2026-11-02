// TASKS.csv #1326 — a ground survey is often in its own grid ("9000N 4650E"), and its GPS file names the same stations with their UTM position, so the grid can be placed
// on the map. Assessment file 28944Z (Scott Geophysics, 2006): BoundaryGPS.txt ties the Boundary grid's mag and IP lines to UTM zone 10. Pure.

// The stations of a parsed station file (dcipStations parseStationFile) as { gx, gy, x, y, z }: a line called 9000N holds stations along east (gx = station, gy = 9000);
// a line called 8575E holds stations along north. A line with no direction in its name says nothing about the grid and is left out.
export function gridPairs(lines) {
  const out = [];
  for (const [name, stations] of Object.entries(lines || {})) {
    const m = /^(-?\d+(?:\.\d+)?)\s*([NSEW])$/i.exec(String(name).trim());
    if (!m) continue;
    const v = Number(m[1]) * (/[SW]/i.test(m[2]) ? -1 : 1), northLine = /[NS]/i.test(m[2]);
    for (const s of stations) out.push({ gx: northLine ? s.s : v, gy: northLine ? v : s.s, x: s.x, y: s.y, z: s.z ?? null, northLine, across: v, along: s.s });
  }
  return out;
}

const solve3 = (A, b) => { // Gaussian elimination, 3 x 3: null when the stations do not span two directions
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
};
function fitOnce(pairs) {
  const mx = pairs.reduce((a, p) => a + p.gx, 0) / pairs.length, my = pairs.reduce((a, p) => a + p.gy, 0) / pairs.length; // centred: UTM against small grid numbers conditions badly
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (const p of pairs) {
    const r = [p.gx - mx, p.gy - my, 1];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; bx[i] += r[i] * p.x; by[i] += r[i] * p.y; }
  }
  const sx = solve3(A, bx), sy = solve3(A, by);
  if (!sx || !sy) return null;
  const apply = (gx, gy) => [sx[0] * (gx - mx) + sx[1] * (gy - my) + sx[2], sy[0] * (gx - mx) + sy[1] * (gy - my) + sy[2]];
  return { sx, sy, apply };
}

// Least-squares affine grid -> map (a grid's axes need not be square to the world, nor its chaining exact). A station more than 3 times the scatter off the fit, a bad GPS
// shot or a mistyped name, is dropped and the fit redone, twice at most. { apply(gx, gy) -> [x, y], rms, used, dropped, azimuth (of grid north, degrees), scale } or null.
export function fitGridToWorld(allPairs) {
  let pairs = allPairs.filter((p) => [p.gx, p.gy, p.x, p.y].every(Number.isFinite));
  const total = pairs.length;
  if (total < 3) return null;
  let fit = fitOnce(pairs), rms = 0;
  for (let round = 0; fit && round < 3; round++) {
    const res = pairs.map((p) => { const [x, y] = fit.apply(p.gx, p.gy); return Math.hypot(x - p.x, y - p.y); });
    rms = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length);
    const keep = pairs.filter((_, i) => res[i] <= Math.max(3 * rms, 1));
    if (round === 2 || keep.length === pairs.length || keep.length < 3) break;
    pairs = keep;
    fit = fitOnce(pairs);
  }
  if (!fit) return null;
  return { apply: fit.apply, rms, used: pairs.length, dropped: total - pairs.length, azimuth: ((Math.atan2(fit.sx[1], fit.sy[1]) * 180) / Math.PI + 360) % 360, scale: Math.hypot(fit.sx[1], fit.sy[1]) };
}

// TASKS.csv #1326 — a cut grid is not regular: 28944Z's line 11200N sits up to 337 m from the best grid-wide fit, where its stations are good to a few metres. So a reading
// on a line with stations goes between that line's two nearest stations, and only one with no stations near it uses the fit. { place(gx, gy) -> { x, y, onLine } | null, lines, stations, fit }.
export function stationPlacer(pairs, { reach = 200 } = {}) {
  const lines = new Map();
  for (const p of pairs) {
    if (![p.along, p.across, p.x, p.y].every(Number.isFinite)) continue;
    const k = `${p.northLine ? "n" : "e"}${p.across}`;
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k).push(p);
  }
  for (const st of lines.values()) st.sort((a, b) => a.along - b.along);
  const on = (st, s) => {
    if (st.length < 2 || s < st[0].along - reach || s > st[st.length - 1].along + reach) return null;
    let i = 0;
    while (i < st.length - 2 && st[i + 1].along < s) i++;
    const a = st[i], b = st[i + 1];
    if (b.along === a.along) return null;
    const t = (s - a.along) / (b.along - a.along);
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), onLine: true };
  };
  const fit = fitGridToWorld(pairs);
  return {
    lines: lines.size, stations: pairs.length, fit,
    place(gx, gy) {
      const n = lines.get(`n${gy}`), e = lines.get(`e${gx}`);
      const hit = (n && on(n, gx)) || (e && on(e, gy));
      if (hit) return hit;
      if (!fit) return null;
      const [x, y] = fit.apply(gx, gy);
      return { x, y, onLine: false };
    },
  };
}

// Elevation of the nearest station to a grid position, within reach
export function nearestStationZ(pairs, gx, gy, reach = 100) {
  let best = null, bestD = reach;
  for (const p of pairs) { if (p.z == null) continue; const d = Math.hypot(p.gx - gx, p.gy - gy); if (d <= bestD) { bestD = d; best = p.z; } }
  return best;
}

// Grid numbers, not map coordinates: thousands for both, where a UTM northing runs to millions and longitude / latitude stay under 360
export function looksLikeLocalGrid(rows, xCol, yCol) {
  let xMax = 0, yMax = 0, n = 0;
  for (const r of rows || []) {
    const x = r[xCol], y = r[yCol];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++; xMax = Math.max(xMax, Math.abs(x)); yMax = Math.max(yMax, Math.abs(y));
  }
  return n > 0 && yMax < 100000 && xMax < 100000 && Math.max(xMax, yMax) > 360;
}
