const toRad = (d) => (d * Math.PI) / 180;

function mcStep(md1, I1, Az1, md2, I2, Az2) {
  const dMD = md2 - md1;
  if (dMD <= 0) return { dN: 0, dE: 0, dTVD: 0 };
  const i1 = toRad(I1), i2 = toRad(I2), a1 = toRad(Az1), a2 = toRad(Az2);
  const cosDL = Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1));
  const dogleg = Math.acos(Math.min(1, Math.max(-1, cosDL)));
  const RF = dogleg < 1e-9 ? 1 : (2 / dogleg) * Math.tan(dogleg / 2);
  const dN = (dMD / 2) * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) * RF;
  const dE = (dMD / 2) * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) * RF;
  const dTVD = (dMD / 2) * (Math.cos(i1) + Math.cos(i2)) * RF;
  return { dN, dE, dTVD };
}

// survey: [{depth, azimuth, dip}] dip = deg below horizontal. Returns world {md,x,y,z} polyline.
export function desurveyHole(collar, survey) {
  let stations = survey && survey.length ? [...survey].sort((a, b) => a.depth - b.depth) : [];
  if (!stations.length) {
    if (collar.azimuth == null || collar.dip == null || isNaN(collar.azimuth) || isNaN(collar.dip)) return [];
    const md = collar.length && !isNaN(collar.length) ? collar.length : 300;
    stations = [{ depth: 0, azimuth: collar.azimuth, dip: collar.dip }, { depth: md, azimuth: collar.azimuth, dip: collar.dip }];
  }
  if (stations[0].depth > 0) stations.unshift({ depth: 0, azimuth: stations[0].azimuth, dip: stations[0].dip });
  const withI = stations.map((s) => ({ md: s.depth, I: 90 - s.dip, Az: s.azimuth }));
  const maxMD = withI[withI.length - 1].md;
  const depths = new Set([0, maxMD]);
  for (let d = 0; d <= maxMD; d += 3) depths.add(Math.round(d * 100) / 100);
  const sorted = Array.from(depths).sort((a, b) => a - b);
  const interpAt = (md) => {
    let lo = withI[0], hi = withI[withI.length - 1];
    for (let i = 0; i < withI.length - 1; i++) if (md >= withI[i].md && md <= withI[i + 1].md) { lo = withI[i]; hi = withI[i + 1]; break; }
    const span = hi.md - lo.md, t = span <= 0 ? 0 : (md - lo.md) / span;
    // TASKS.csv #218 — azimuth is a compass bearing, not a plain number: interpolating the raw degree
    // values (e.g. 355 -> 5) took the LONG way around through 180 instead of the short way through
    // 0/360, producing large positional errors on any north-trending hole. Unwrap to the shortest
    // signed delta in (-180, 180] before interpolating, then normalize the result back to [0, 360).
    const rawDelta = hi.Az - lo.Az;
    const shortDelta = ((rawDelta % 360) + 540) % 360 - 180;
    let az = lo.Az + shortDelta * t;
    az = ((az % 360) + 360) % 360;
    return { md, I: lo.I + (hi.I - lo.I) * t, Az: az };
  };
  const fine = sorted.map(interpAt);
  let N = 0, E = 0, TVD = 0;
  const pts = [{ md: 0, N: 0, E: 0, TVD: 0 }];
  for (let i = 1; i < fine.length; i++) {
    const a = fine[i - 1], b = fine[i];
    const { dN, dE, dTVD } = mcStep(a.md, a.I, a.Az, b.md, b.I, b.Az);
    N += dN; E += dE; TVD += dTVD;
    pts.push({ md: b.md, N, E, TVD });
  }
  return pts.map((p) => ({ md: p.md, x: collar.x + p.E, y: collar.y + p.N, z: collar.z - p.TVD }));
}

// Interpolate a world-space {x,y,z} position at an arbitrary MD along an already-desurveyed trace
// (the array desurveyHole() returns). Pulled out as its own export — several callers (section views,
// the strip-log/3D-view rendering in ViewerModule, and now the grade-estimation sample-point builder
// in estimation.js) all need "where is the hole at depth D" and previously each grew its own inline
// copy of this same interpolation; sharing one here keeps the (deliberately simple, linear-between-
// stations) interpolation behavior consistent everywhere it's used.
export function pointOnTrace(pts, md) {
  if (!pts || !pts.length) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (md >= pts[i].md - 0.01 && md <= pts[i + 1].md + 0.01) {
      const span = pts[i + 1].md - pts[i].md, t = span <= 0 ? 0 : (md - pts[i].md) / span;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t };
    }
  }
  const edge = md <= pts[0].md ? pts[0] : pts[pts.length - 1];
  return { x: edge.x, y: edge.y, z: edge.z };
}
