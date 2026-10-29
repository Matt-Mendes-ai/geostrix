// TASKS.csv #1101 (review #1016, Leapfrog-style implicit modeller) — the interface points and orientations a GemPy run
// actually sent, kept on each surface and written out in GemPy's own table layout. The only related file was the Boundary
// intercepts CSV: every logged top, one code at a time, without the groups / modelling codes, drawn section contacts,
// explicit-surface points, map contacts, domain and search filters, orientation thinning or cluster nuggets a run uses,
// so a GemPy surface could not be checked in GemPy or rebuilt in Leapfrog.
//
// Kept in WORLD coordinates (the run's API frame + the scene origin), BEFORE any trend warp (the warp is a solve-frame
// device; its parameters are in the surface's own provenance), with each point's nugget when it had one (a soft
// intercept #88 or a smoothed cluster #761). Pure: no React.

const r3 = (v) => Math.round(v * 1000) / 1000;

// spec: the run's spec for one surface (API frame: points / orientations relative to `origin`, unwarped); sent: the same
// spec as sent to the sidecar (warped and smoothed: only its per-point nuggets are read, same order); origin {x, y, z}.
// -> { points: [[x, y, z, nugget | null]], orientations: [[x, y, z, dip, azimuth]], fault }
export function captureInputs(spec, sent, origin) {
  const o = origin || { x: 0, y: 0, z: 0 };
  return {
    points: (spec.points || []).map((p, i) => {
      const n = sent?.points?.[i]?.nugget ?? p.nugget;
      return [r3(p.x + o.x), r3(p.y + o.y), r3(p.z + o.z), Number.isFinite(n) ? n : null];
    }),
    orientations: (spec.orientations || []).map((q) => [r3(q.x + o.x), r3(q.y + o.y), r3(q.z + o.z), +Number(q.dip).toFixed(2), +Number(q.azimuth).toFixed(2)]),
    fault: !!spec.fault,
  };
}

const csvName = (s) => (/[",\r\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

// surfaces: [{ name, inputs }] (one run: a stack has several, faults included) -> { "surface_points.csv", "orientations.csv" }
// GemPy's column names (gempy.data.SurfacePointsTable / OrientationsTable readers): X, Y, Z, surface (+ nugget);
// X, Y, Z, azimuth, dip, polarity, surface. Polarity is 1: GeoStrix orientations are planes with the pole up.
export function gempyInputCsvs(surfaces) {
  const pts = ["X,Y,Z,surface,nugget"], ori = ["X,Y,Z,azimuth,dip,polarity,surface"];
  for (const { name, inputs } of surfaces) {
    if (!inputs) continue;
    for (const [x, y, z, n] of inputs.points) pts.push(`${x},${y},${z},${csvName(name)},${n == null ? "" : n}`);
    for (const [x, y, z, dip, az] of inputs.orientations) ori.push(`${x},${y},${z},${az},${dip},1,${csvName(name)}`);
  }
  return { "surface_points.csv": pts.join("\r\n") + "\r\n", "orientations.csv": ori.join("\r\n") + "\r\n" };
}

// the surfaces of the same run as `surf` (a stack registers each of its units with one params.runId), in list order
export function runSurfaces(all, surf) {
  const id = surf?.params?.runId;
  if (!id) return surf?.params?.inputs ? [surf] : [];
  return (all || []).filter((s) => s.params?.runId === id && s.params?.inputs);
}

// TASKS.csv #1101 — the "Model inputs" package of one run: the two GemPy tables and a provenance.txt (its stamp lines,
// passed in, then what the tables hold). -> [{ name, text }]
export function gempyInputFiles(surfaces, stampLines) {
  const csvs = gempyInputCsvs(surfaces.map((s) => ({ name: s.params?.surface || s.name, inputs: s.params.inputs })));
  const nP = surfaces.reduce((n, s) => n + s.params.inputs.points.length, 0), nO = surfaces.reduce((n, s) => n + s.params.inputs.orientations.length, 0);
  const faults = surfaces.filter((s) => s.params.inputs.fault).map((s) => s.params?.surface || s.name);
  const prov = [
    ...stampLines,
    "",
    `Model inputs of this GemPy run: ${surfaces.length} surface(s), ${nP} interface point(s), ${nO} orientation(s), exactly as sent to GemPy (after groups, modelling codes, section and map contacts, domain and search filters and orientation thinning).`,
    "Coordinates: world (the project CRS above), BEFORE any structural-trend warp: GeoStrix solves a trended model in a stretched frame whose centre, axes and ratios are in the Anisotropy line above.",
    "surface_points.csv: X, Y, Z, surface, nugget (blank = GemPy's default; set on soft intercepts and smoothed clustered contacts).",
    "orientations.csv: X, Y, Z, azimuth (dip direction, degrees from grid north), dip (degrees), polarity (1 = normal), surface.",
    `Surfaces in stack order: ${surfaces.map((s) => s.params?.surface || s.name).join(", ")}.${faults.length ? ` Faults: ${faults.join(", ")}.` : ""}`,
  ];
  return [{ name: "surface_points.csv", text: csvs["surface_points.csv"] }, { name: "orientations.csv", text: csvs["orientations.csv"] }, { name: "provenance.txt", text: prov.join("\r\n") + "\r\n" }];
}
