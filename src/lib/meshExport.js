// Export a generated implicit surface's triangle mesh to standard formats other software can open
// (TASKS.csv #143). Once a surface exists it currently only lives inside GeoStrix's own 3D view — no
// handoff to Vulcan/Surpac/Datamine, geotechnical software, or even a generic mesh viewer. This closes
// that gap with three formats covering the common cases: OBJ (universal, human-readable, opens in
// nearly anything), glTF/GLB (modern standard, preserves normals, good for web/Blender/etc.), and DXF
// (3DFACE entities — the one most mining-software users will actually reach for first).
//
// All three write REAL-WORLD coordinates (project easting/northing/elevation), not GeoStrix's internal
// scene-space (which is just the world shifted to keep numbers small/precise near the origin — see
// ViewerModule.jsx's originRef). Nobody downstream wants a mesh sitting at scene-local coordinates
// with no way to place it back on the property; sceneVertsToWorld below undoes exactly the shift
// ViewerModule's own sceneToApi/apiToScene helpers already use elsewhere in this codebase (world =
// scene + origin on x, world = origin - scene.z on y/northing, world = scene.y + origin.z on
// elevation), so an exported mesh drops in at the same coordinates as the source drillhole/assay data.
//
// TASKS.csv #140's volumetrics work is a good reason to trust this coordinate mapping. computeMeshVolume
// there treats the raw scene-space vertices as already being real-world *meters* (i.e. Euclidean
// distances in scene-space equal real-world distances) — true only if the scene<->world map is a rigid
// motion (pure rotation/reflection + translation, no scaling/shear). That is the same assumption this
// module leans on going the other direction: converting scene coordinates to world coordinates is a
// coordinate-frame change, not a distortion, so mesh shape/scale/angles come out unchanged. Both this
// module and volumetrics.js verified their own math independently (see this repo's test scripts /
// TASKS.csv entries) rather than one silently trusting the other's assumption.
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import * as THREE from "three";
import { sceneVertsToWorldFlat } from "./meshFlat.js"; // #1072

// Reads a mesh's position/index buffers and returns plain arrays of world-space vertices + 0-based
// triangle indices. `origin` is ViewerModule's originRef.current ({x,y,z} world coords of the scene
// origin). Kept independent of THREE so the OBJ/DXF writers below don't need a THREE.Mesh at all —
// only exportGLTF (which needs a real THREE geometry to hand to GLTFExporter) builds one.
export function sceneVertsToWorld(geometry, origin) {
  const pos = geometry?.attributes?.position;
  if (!pos) return { vertices: [], indices: [] };
  const ox = origin?.x || 0, oy = origin?.y || 0, oz = origin?.z || 0;
  const vertices = [];
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i), sy = pos.getY(i), sz = pos.getZ(i);
    // inverse of ViewerModule's sceneToApi + origin-add (see module header comment)
    vertices.push([sx + ox, oy - sz, sy + oz]);
  }
  const index = geometry.index;
  const indices = [];
  if (index) {
    for (let i = 0; i < index.count; i++) indices.push(index.getX(i));
  } else {
    for (let i = 0; i < pos.count; i++) indices.push(i);
  }
  return { vertices, indices };
}

// sceneVertsToWorldFlat lives in meshFlat.js (TASKS.csv #600: the surface save path needs it at startup; the
// rest of this module, with three's GLTFExporter, now loads on first export).
export { sceneVertsToWorldFlat } from "./meshFlat.js";

// TASKS.csv #269 — provenance stamp. A mesh that leaves this app with no record of the cutoff,
// method, search radius, cell size, closure mode, density and sample count behind it is a mesh that
// gets re-imported six months later as gospel. `provenance` is the surface's own params block (see
// runNumericModel); this renders it as plain comment lines the format allows, always leading with the
// "not a Mineral Resource estimate" line so it survives being read by a human or grepped by a script.
export function provenanceLines(name, provenance, extra = {}) {
  const out = [
    `GeoStrix exploration model — not a Mineral Resource estimate.`,
    `Surface: ${name}`,
    `Exported: ${new Date().toISOString()}`,
  ];
  // TASKS.csv #145 — HAND-EDIT DISCLOSURE, and it goes SECOND, immediately under the "not a Mineral
  // Resource" line, before any parameter is stated. A sculpted surface is no longer the output of the
  // parameters listed further down; a file that recites its cutoff and search radius while silently
  // omitting that a geologist pulled a patch of it 6 m sideways is an integrity problem, not a missing
  // nicety. Every applied edit is itemised (when, how far, which way, how wide, where, and what it did
  // to the enclosed volume) so the edited surface can be audited against the generated one.
  const me = extra.manualEdits;
  if (me && me.count > 0) {
    out.push(`*** HAND-EDITED AFTER GENERATION — ${me.count} manual sculpt${me.count === 1 ? "" : "s"} applied. This mesh is NOT purely the output of the parameters stated below. ***`);
    if (me.volumeAsGeneratedM3 != null && me.volumeNowM3 != null) {
      const d = me.volumeNowM3 - me.volumeAsGeneratedM3;
      out.push(`Enclosed volume as generated: ${me.volumeAsGeneratedM3.toFixed(1)} m3 -> after manual editing: ${me.volumeNowM3.toFixed(1)} m3 (${d >= 0 ? "+" : ""}${d.toFixed(1)} m3). Any tonnage above is from the EDITED volume.`);
    }
    (me.edits || []).forEach((e, i) => {
      out.push(`  edit ${i + 1}: ${e.at} — ${e.offsetM >= 0 ? "+" : ""}${e.offsetM} m ${e.axis === "vertical" ? "vertical" : "along the surface normal"}, ${e.radiusM} m brush radius, ${e.verticesMoved} vertices moved, centred on ${e.anchorEasting} E / ${e.anchorNorthing} N / ${e.anchorElevation} m${e.flippedTriangles ? ` — WARNING: left ${e.flippedTriangles} inverted triangle(s)` : ""}`);
    });
    out.push(`Manual edits move vertices only; triangle connectivity is unchanged, so the mesh is exactly as watertight (or not) as it was when generated.`);
  }
  if (extra.epsg) out.push(`Project CRS: EPSG:${extra.epsg}`);
  if (extra.densityTPerM3 != null) out.push(`Bulk density used for tonnage: ${extra.densityTPerM3} t/m3 (assumed, not measured)`);
  if (extra.volumeM3 != null) out.push(`Enclosed volume: ${extra.volumeM3.toFixed(1)} m3 (in-situ, dry, undiluted, no recovery applied)`);
  if (extra.openSurface) out.push("Open surface: it encloses no volume (no tonnage can be taken from it)"); // TASKS.csv #1028
  // TASKS.csv #276 — this block was written for the numeric grade shell's params and assumed its fields
  // (element/cutoff/method/...). Every GemPy-generated surface and the #272 alteration halo now carry a
  // params block too, with a different shape, so the lines are emitted per available field instead of
  // per assumed field — an implicit surface exported with no cutoff no longer stamps "cutoff: undefined".
  if (provenance && provenance.tool && provenance.element == null) {
    const q = provenance;
    out.push(`Tool: ${q.tool}`);
    if (q.surface) out.push(`Surface: ${q.surface} | interface points: ${q.sourcePoints} | orientations: ${q.orientations}`);
    if (q.target && q.isoLevel != null) out.push(`Alteration assemblage: ${q.target} | indicator iso-level: ${q.isoLevel}`);
    // TASKS.csv #144 — the vein/dyke tool's params have their own shape (no iso-level, no element), and
    // the numbers that matter for auditing a vein are the attitude, the TRUE-vs-downhole thickness and
    // the honesty diagnostics — an exported vein that stated its cell size but not that its thickness is
    // an interpolation between a handful of intercepts would be exactly the overclaim #269 guards against.
    if (q.construction && q.target) {
      out.push(`Vein/dyke: ${q.target} — this file is the ${q.part || "surface"} of a paired hangingwall/footwall model`);
      out.push(`Construction: ${q.construction}`);
      out.push(`Reference attitude: ${q.dip?.toFixed ? q.dip.toFixed(1) : q.dip} dip / ${q.dipDir?.toFixed ? q.dipDir.toFixed(1) : q.dipDir} dip direction (${q.attitudeSource})${q.rmsOffReferencePlaneM != null ? ` | intercept midpoints scatter ${q.rmsOffReferencePlaneM.toFixed(1)} m RMS off that plane` : ""}`);
      out.push(`TRUE thickness (corrected for oblique intersection): ${q.trueThicknessMinM?.toFixed(2)}–${q.trueThicknessMaxM?.toFixed(2)} m, mean ${q.trueThicknessMeanM?.toFixed(2)} m | mean DOWNHOLE length was ${q.downholeThicknessMeanM?.toFixed(2)} m`);
      out.push(`Paired intercepts: ${q.intercepts} | grid: ${q.cellSizeM?.toFixed(1)} m cells${q.cellSizeAuto ? " (auto)" : ""}, ${Math.round(q.searchRadiusM)} m in-plane search${q.searchRadiusAuto ? " (auto)" : ""}${q.gridCoarsened ? ", coarsened to stay under the grid limit" : ""}, ${q.informedNodes} informed nodes`);
      out.push(`Hangingwall and footwall cannot cross: both are offsets of one midplane by ±half a non-negative thickness field (minimum modelled thickness ${q.minSeparationM?.toFixed(3)} m${q.pinchOut ? ", the vein pinches out to zero" : ""}).`);
      if (q.contactResidualRmsM != null) out.push(`Fit at the logged contacts: ${q.contactResidualRmsM.toFixed(2)} m RMS (max ${q.contactResidualMaxM?.toFixed(2)} m) — measured AT the intercepts, where an inverse-distance field nearly reproduces its own data.`);
      if (q.midplaneLooRmsM != null) out.push(`Leave-one-out cross-validation of the midplane: ${q.midplaneLooRmsM.toFixed(1)} m RMS (worst ${q.midplaneLooMaxM?.toFixed(1)} m) against a ${Math.round(q.searchRadiusM)} m search radius${q.incoherentSheet ? " — NO predictive skill at this hole spacing: these intercepts are not one continuous sheet" : ""}`);
      if (q.nominalHwFwLabels) out.push(`This structure is near-vertical, so "hangingwall" and "footwall" are nominal labels.`);
      out.push(`Away from the drillholes this vein's shape, thickness and extent are the interpolation's, not the data's — it is an interpretation, not a measurement.`);
    }
    if (q.relation) out.push(`Unit relationship: ${q.relation === "erode" ? "erode (each unit truncates those below — unconformity)" : "onlap (conformable pile, one shared interpolated field)"}`);
    if (q.resolution) out.push(`Model grid resolution: ${q.resolution.join(" x ")} cells`);
    if (q.gempyRange != null) out.push(`GemPy potential-field range: ${q.gempyRange}${q.gempyRangeDefault != null ? ` (GemPy default ${q.gempyRangeDefault}${q.gempyRangeMultiplier ? `, multiplier ${q.gempyRangeMultiplier}` : ", used as-is"})` : ""}${q.gempyCO != null ? ` | c_o: ${q.gempyCO}` : ""}`);
    if (q.method) out.push(`Interpolation: ${q.method} | search radius: ${Math.round(q.searchRadiusM)} m${q.searchRadiusAuto ? " (auto, from hole spacing)" : ""} | cell size: ${q.cellSizeM.toFixed ? q.cellSizeM.toFixed(2) : q.cellSizeM} m${q.cellSizeAuto ? " (auto)" : ""}${q.cellSizeCoarsened ? " — coarsened to stay under the grid limit" : ""}`);
    if (q.holeSpacingM != null) out.push(`Median hole spacing behind those auto values: ${Math.round(q.holeSpacingM)} m`);
    if (q.anisotropy) out.push(anisotropyLine(q.anisotropy)); // #674 — the #650 trend shape printed "undefined"
    if (q.searchEllipsoid) out.push(`Search ellipsoid: ${q.searchEllipsoid.azimuth}/${q.searchEllipsoid.dip} deg, ranges ${q.searchEllipsoid.major}/${q.searchEllipsoid.semiMajor}/${q.searchEllipsoid.minor} m, min neighbours ${q.searchEllipsoid.minSamples}`);
    if (q.domain) out.push(`Model domain: ${q.domain}${q.clippedToDomain ? " (output mesh clipped to it)" : " (input points restricted to it)"}`);
    if (q.extent) out.push(`Modelled extent (project coords, origin-relative): ${q.extent.join(", ")}`);
    if (q.samplePoints != null) out.push(`Sample points: ${q.samplePoints}${q.alteredSamplePoints != null ? ` (${q.alteredSamplePoints} inside the assemblage)` : ""}${q.cellsEstimated != null ? ` | cells estimated: ${q.cellsEstimated}` : ""}`);
    if (q.closure) out.push(`Closure mode: ${q.closure}${q.closure === "artificial" ? " (part of the boundary is the search-radius wall, NOT a logged boundary)" : ""}`);
    if (q.generatedAt) out.push(`Generated: ${q.generatedAt}`);
    constructionLines(q).forEach((l) => out.push(l)); // TASKS.csv #862
    // #862 — and every field no line above knows, so a tool added later never leaves with only "Tool: ..."
    const rest = Object.keys(q).filter((k) => !PRINTED.has(k) && !constructionKeys(q).has(k) && q[k] != null && q[k] !== "" && typeof q[k] !== "function");
    if (rest.length) out.push(`Other parameters: ${rest.map((k) => `${k} = ${fieldText(q[k])}`).join(" | ")}`);
  } else if (provenance) {
    const q = provenance;
    out.push(`Tool: ${q.tool}`);
    out.push(`Element: ${q.element} (${q.unit}) | cutoff: ${q.cutoff}`);
    out.push(`Method: ${q.method} | search radius: ${Math.round(q.searchRadiusM)} m${q.searchRadiusWasUnlimited ? " (entered as unlimited, capped at grid diagonal)" : ""} | cell size: ${q.cellSizeM} m | padding: ${q.paddingM} m`);
    // TASKS.csv #262 — min coverage is a real estimation parameter (it decides whether a half-missing-core
    // composite counts as a full sample), so it belongs in the audit trail alongside the composite length.
    out.push(`Compositing: ${q.composited ? `${q.compositeLengthM} m${q.minCoverage != null ? `, min coverage ${Math.round(q.minCoverage * 100)}%` : ""}` : "none (raw intervals)"} | high-grade cap: ${q.capValue == null ? "none" : q.capValue} | min distinct holes: ${q.minHoles} | QC samples: ${q.includeQAQC ? "included" : "excluded"}`);
    out.push(`Closure mode: ${q.closure}${q.closure === "artificial" ? " (part of the boundary is the search-radius wall, NOT a grade boundary — volume depends on the search radius)" : ""}`);
    out.push(`Sample points: ${q.samplePoints} | cells estimated: ${q.cellsEstimated}${q.singleHoleCells ? ` (${q.singleHoleCells} informed by a single hole)` : ""}`);
    if (q.anisotropy) out.push(anisotropyLine(q.anisotropy)); // #674
    if (q.searchEllipsoidM) out.push(`Search ellipsoid semi-axes along the trend: ${q.searchEllipsoidM.join(" x ")} m (#656 — the block model's ellipsoid for the same radius)`);
    if (q.meanGradeInShell != null) out.push(`Mean interpolated grade inside the shell: ${q.meanGradeInShell.toFixed(3)} ${q.unit} (not a resource grade)`);
    out.push(`Generated: ${q.generatedAt}`);
  }
  // #674 — "No anisotropy" only when there was none (it followed the trend line above whenever a trend was used)
  const anis = provenance?.anisotropy;
  // #862 — a hand-built construction is not an interpolation: the grade-shell closing line ("No anisotropy, no
  // variogram...") read as if one had been run
  if (provenance && constructionKind(provenance)) out.push(`A geological interpretation built from the inputs listed above, not an estimate: no variogram, no classification, no dilution or recovery. Must not be reported publicly as a Mineral Resource under NI 43-101 or JORC.`);
  else out.push(`${anis ? "" : "No anisotropy, "}${anis ? "No" : "no"} variogram, no classification, no dilution or recovery. Must not be reported publicly as a Mineral Resource under NI 43-101 or JORC.`);
  return out;
}

// TASKS.csv #862 — the params fields the GemPy / alteration / vein branch of provenanceLines prints (or deliberately
// leaves out: builtKey is an internal rebuild key, the edit fields are stamped by the hand-edit block).
const PRINTED = new Set(["tool", "surface", "sourcePoints", "orientations", "target", "isoLevel", "construction", "part", "dip", "dipDir", "attitudeSource",
  "rmsOffReferencePlaneM", "trueThicknessMinM", "trueThicknessMaxM", "trueThicknessMeanM", "downholeThicknessMeanM", "intercepts", "cellSizeM", "cellSizeAuto",
  "searchRadiusM", "searchRadiusAuto", "gridCoarsened", "informedNodes", "minSeparationM", "pinchOut", "contactResidualRmsM", "contactResidualMaxM",
  "midplaneLooRmsM", "midplaneLooMaxM", "incoherentSheet", "nominalHwFwLabels", "relation", "resolution", "gempyRange", "gempyRangeDefault",
  "gempyRangeMultiplier", "gempyCO", "method", "cellSizeCoarsened", "holeSpacingM", "anisotropy", "searchEllipsoid", "domain", "clippedToDomain", "extent",
  "samplePoints", "alteredSamplePoints", "cellsEstimated", "closure", "generatedAt", "builtKey", "manuallyEdited", "edits", "editCount"]);

// one value as text, short enough for a header line
function fieldText(v) {
  let s;
  if (Array.isArray(v)) s = v.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  return s.length > 300 ? `${s.slice(0, 297)}...` : s;
}

// TASKS.csv #862 — the hand-built kinds: an explicit surface, a linked-outline wireframe, a vein solid, a unit volume
function constructionKind(q) {
  if (q.picks != null && q.sectionLines != null) return "explicit";
  if (q.pointsPerOutline != null) return "wireframe";
  if (q.hangingwall != null && q.footwall != null) return "veinSolid";
  if (q.cellVolumeM3 != null) return "unitVolume";
  return null;
}
const CONSTRUCTION_KEYS = {
  explicit: ["trend", "picks", "sectionLines", "sections", "lineSpacingM", "points", "mapContacts", "mapLines", "dipGuide", "frame", "maxMisfitM", "marginM", "looRmsM", "looMaxM", "overshootM", "extrapolatedPct", "furthestFromInputM", "cutAtTerrain", "builtAt"],
  wireframe: ["body", "sections", "pointsPerOutline", "volumeM3", "ends", "builtAt", "tiedOutlines", "foldedStrips"],
  veinSolid: ["hangingwall", "footwall", "volumeM3", "trueThicknessM", "attitude", "gridCellM", "nodesWhereWallsMeet", "ends", "builtAt"],
  unitVolume: ["unit", "model", "builtAt", "cells", "cellVolumeM3", "cellsVolumeM3", "shellVolumeM3", "note", "volumeBandM3", "blockSizeM", "cutByBox"],
};
function constructionKeys(q) { return new Set(CONSTRUCTION_KEYS[constructionKind(q)] || []); }

function constructionLines(q) {
  const kind = constructionKind(q), out = [];
  const n = (v, d = 0) => (v == null || !Number.isFinite(+v) ? "?" : (+v).toLocaleString("en-US", { maximumFractionDigits: d }));
  if (kind === "explicit") {
    const secs = Array.isArray(q.sections) ? q.sections : [];
    const inputs = [`${q.picks} pick(s) on drillhole traces`, `${q.sectionLines} section line(s)${secs.length ? ` on ${secs.join(", ")}` : ""}${q.sectionLines && q.lineSpacingM ? ` (resampled every ${q.lineSpacingM} m)` : ""}`];
    if (q.mapLines) inputs.push(`${q.mapLines} mapped contact line(s)${q.mapContacts?.length ? ` (${q.mapContacts.join("; ")})` : ""}`);
    if (q.dipGuide) inputs.push(`${q.dipGuide.lines} dip guide line(s) projected ${q.dipGuide.depthM} m down dip (CONSTRUCTED, not observed)`);
    out.push(`Inputs: ${inputs.join(", ")} — ${q.points} distinct points used`);
    out.push(`Method: thin-plate spline passing exactly through every input point, fitted ${/^over /.test(q.frame || "") ? q.frame : `as ${q.frame || "elevation over the map"}`}; solver misfit at the inputs ${q.maxMisfitM} m (exact by construction, so it says nothing about accuracy away from them)`);
    out.push(q.looRmsM != null ? `Leave-one-out at the inputs: ${q.looRmsM} m RMS, worst ${q.looMaxM} m (each point predicted from all the others)` : `Leave-one-out at the inputs: not computed (over 300 points)`);
    if (q.overshootM != null) out.push(`Overshoot beyond the inputs' elevation range inside their outline: ${q.overshootM} m | extrapolated beyond the inputs: ${q.extrapolatedPct}% of the surface, up to ${n(q.furthestFromInputM)} m from the nearest input | margin around the inputs: ${q.marginM} m`);
    out.push(`Cut at the terrain: ${q.cutAtTerrain ? "yes" : "no"}`);
    if (q.trend) out.push(`Structural trend${q.trend.name ? ` "${q.trend.name}"` : ""}: the spline is ${q.trend.ratio} times smoother along ${q.trend.alongAzimuthDeg} deg (the trend's major axis in the surface's plane) than across; still exact at every input`); // #881
  } else if (kind === "wireframe") {
    const secs = Array.isArray(q.sections) ? q.sections : [];
    out.push(`Body: ${q.body} | linked outlines on ${secs.length} section(s): ${secs.join(", ")} | resampled to ${q.pointsPerOutline} points per outline`);
    out.push(`Ends: ${q.ends || "flat caps on the first and last outline"} | between outlines the solid is straight-line interpolation, nothing else is inferred`);
    if (q.volumeM3 != null) out.push(`Volume when built: ${n(q.volumeM3)} m3`);
    if (q.tiedOutlines) out.push(`Tie points: ${q.tiedOutlines} outline(s) carry one; tied neighbours are paired tie to tie`); // #874
    if (q.foldedStrips) out.push(`WARNING: ${q.foldedStrips} strip quad(s) between outlines are folded (points that did not pair up): the volume there is unreliable`);
  } else if (kind === "veinSolid") {
    const t = q.trueThicknessM || {};
    out.push(`Walls: hangingwall "${q.hangingwall}", footwall "${q.footwall}" | attitude ${q.attitude}`);
    out.push(`TRUE thickness between the walls: ${t.min}–${t.max} m, mean ${t.mean} m | grid ${q.gridCellM} m cells (edges are stepped at that size) | ${q.nodesWhereWallsMeet || 0} node(s) where the walls meet or cross, left out`);
    out.push(`Ends: ${q.ends}`);
    if (q.volumeM3 != null) out.push(`Volume when built: ${n(q.volumeM3)} m3`);
  } else if (kind === "unitVolume") {
    out.push(`Unit: ${q.unit} | implicit model: ${q.model}${q.builtAt ? ` (run ${q.builtAt})` : ""}`);
    out.push(`Volume = a COUNT of model blocks: ${n(q.cells)} cells x ${q.cellVolumeM3} m3 = ${n(q.cellsVolumeM3)} m3 | the shell around those blocks encloses ${n(q.shellVolumeM3)} m3`);
    // TASKS.csv #877
    if (q.volumeBandM3 != null) out.push(`Up to +/- ${n(q.volumeBandM3)} m3 from the block size alone${q.blockSizeM ? ` (${q.blockSizeM.join(" x ")} m blocks; half a block at every contact)` : ""}`);
    if (q.cutByBox?.length) out.push(`Reaches the model box ${q.cutByBox.join(", ")}: there it is cut by the box, not by geology, and its volume depends on where the box was drawn.`);
    if (q.note) out.push(q.note);
  }
  if (kind && kind !== "unitVolume" && q.builtAt) out.push(`Built: ${q.builtAt}`);
  return out;
}

// TASKS.csv #674 — one line for either anisotropy shape: the #650 named structural trend (dip / dip azimuth / pitch +
// ratios) or the older two-angle ellipsoid (azimuth / dip + ranges).
export function anisotropyLine(a) {
  if (a.dipAzimuth != null) {
    const r = a.ratios || {};
    return `Structural trend${a.trend ? ` "${a.trend}"` : ""}: dip ${a.dip} deg towards ${a.dipAzimuth} deg, pitch ${a.pitch} deg (from the right-hand-rule strike towards down dip), ratios ${r.max} : ${r.int} : ${r.min} (along pitch : across in the plane : across the plane)`;
  }
  return `Anisotropy trend: ${a.azimuth}/${a.dip} deg, ranges ${a.major}/${a.semiMajor}/${a.minor} m`;
}

// TASKS.csv #1072 (review #1016, performance #5) — the OBJ and DXF text is built in chunks of CHUNK entities from the flat
// world arrays, each vertex's coordinates formatted ONCE (a vertex is shared by ~6 triangles), one string per entity.
// The DXF built 29 strings per triangle and formatted every vertex for every face: 24 s and +1.8 GB at 1M triangles.
// The text is unchanged (test/meshText1072.test.mjs). The app saves the chunks as UTF-8 bytes (surfaceTextBytes) rather
// than one string of hundreds of MB.
const CHUNK = 50000;
function objChunks(name, geometry, origin, provenance, extra) {
  const { vertices: V, indices: I } = sceneVertsToWorldFlat(geometry, origin);
  const head = [`# ${name} — exported from GeoStrix`]; // TASKS.csv #143
  provenanceLines(name, provenance, extra).forEach((l) => head.push(`# ${l}`)); // TASKS.csv #269
  head.push(`o ${sanitizeName(name)}`);
  const out = [head.join("\n")];
  let buf = [];
  const flush = () => { if (buf.length) { out.push(buf.join("\n")); buf = []; } };
  for (let i = 0; i < V.length; i += 3) { buf.push(`v ${V[i].toFixed(4)} ${V[i + 1].toFixed(4)} ${V[i + 2].toFixed(4)}`); if (buf.length >= CHUNK) flush(); }
  flush();
  for (let t = 0; t + 2 < I.length; t += 3) { buf.push(`f ${I[t] + 1} ${I[t + 1] + 1} ${I[t + 2] + 1}`); if (buf.length >= CHUNK) flush(); }
  flush();
  return { chunks: out, sep: "\n" };
}
// the chunks as one UTF-8 file (the separator between chunks, a newline at the end)
export function surfaceTextBytes({ chunks, sep }) {
  const enc = new TextEncoder(), parts = chunks.map((c, i) => enc.encode(i ? sep + c : c)), end = enc.encode("\n");
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0) + end.length);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  out.set(end, o);
  return out;
}
const joinChunks = ({ chunks, sep }) => chunks.join(sep) + "\n";

// OBJ — plain text, universally supported. 1-indexed faces per the OBJ spec.
export function exportSurfaceOBJ(name, geometry, origin, provenance = null, extra = {}, { bytes = false } = {}) {
  const c = objChunks(name, geometry, origin, provenance, extra);
  return bytes ? surfaceTextBytes(c) : joinChunks(c);
}

// DXF (ASCII, R12-compatible subset) — one 3DFACE entity per triangle, the standard way to hand a
// triangulated surface to AutoCAD-family and most mining packages (Vulcan/Surpac both read 3DFACE
// meshes). Deliberately minimal: just a SECTION/ENTITIES block + EOF, skipping HEADER/TABLES/BLOCKS —
// every DXF reader tested against (a hand round-trip through a DXF-capable viewer, see this task's
// TASKS.csv verification note) accepts this; a full HEADER section only matters if the consumer needs
// $ACADVER-gated features, which a bare triangle mesh does not. A 3DFACE always carries 4 vertex codes
// (10/20/30 .. 13/23/33) even for a triangular face — the 4th vertex is conventionally a repeat of the
// 3rd, per the DXF spec, not a degenerate/invalid entity.
export function exportSurfaceDXF(name, geometry, origin, provenance = null, extra = {}, { bytes = false } = {}) {
  const { vertices: V, indices: I } = sceneVertsToWorldFlat(geometry, origin);
  const layer = sanitizeName(name).slice(0, 255) || "SURFACE";
  const head = [];
  // TASKS.csv #269 — group code 999 is the DXF spec's own comment record; readers ignore it, humans
  // and grep don't. Written before the ENTITIES section so it sits at the top of the file.
  provenanceLines(name, provenance, extra).forEach((l) => head.push("999", l));
  head.push("0", "SECTION", "2", "ENTITIES");
  // #1072 — each vertex's three coordinates, formatted once, as the text after each group code
  const nv = V.length / 3, X = new Array(nv), Y = new Array(nv), Z = new Array(nv);
  for (let i = 0; i < nv; i++) { X[i] = V[3 * i].toFixed(4); Y[i] = V[3 * i + 1].toFixed(4); Z[i] = V[3 * i + 2].toFixed(4); }
  const pre = `0\n3DFACE\n8\n${layer}\n`;
  const out = [head.join("\n")];
  let buf = [];
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    // the repeated 3rd vertex (13/23/33) is standard for a triangular 3DFACE
    buf.push(`${pre}10\n${X[a]}\n20\n${Y[a]}\n30\n${Z[a]}\n11\n${X[b]}\n21\n${Y[b]}\n31\n${Z[b]}\n12\n${X[c]}\n22\n${Y[c]}\n32\n${Z[c]}\n13\n${X[c]}\n23\n${Y[c]}\n33\n${Z[c]}`);
    if (buf.length >= CHUNK) { out.push(buf.join("\n")); buf = []; }
  }
  if (buf.length) out.push(buf.join("\n"));
  out.push("0\nENDSEC\n0\nEOF");
  const c = { chunks: out, sep: "\n" };
  return bytes ? surfaceTextBytes(c) : joinChunks(c);
}

// glTF (binary .glb) — via three.js's own GLTFExporter, which handles the format's chunk/JSON/buffer
// structure correctly (hand-rolling glTF would be a lot of low-value bookkeeping three.js already
// solved). Builds a throwaway THREE.Mesh with WORLD-space vertices baked directly into its geometry
// (not via mesh.position/matrix, which would just relocate the object without changing what's actually
// written to the exported vertex buffer the way we need) so the same real-world-coordinate convention
// as the OBJ/DXF exporters applies here too.
// TASKS.csv #413 — glTF vertex buffers are 32-bit floats: a UTM northing written directly loses its
// decimals (Math.fround(6298450.37) = 6298450.5, errors up to +-0.5 m). The vertices are written relative
// to a local origin (the bounding-box minimum, rounded to whole metres so it is exact) and that origin goes
// into the node's `translation`, which glTF stores as a full-precision JSON number — any viewer applies
// it, so the surface still lands at its real coordinates, now to float32 precision of LOCAL values (mm).
export function localizeVertices(vertices) {
  const off = [0, 1, 2].map((k) => { let m = Infinity; for (const v of vertices) if (v[k] < m) m = v[k]; return Number.isFinite(m) ? Math.floor(m) : 0; });
  return { offset: off, local: vertices.map((v) => [v[0] - off[0], v[1] - off[1], v[2] - off[2]]) };
}
// TASKS.csv #1031 (review #1016: software design, implicit modeller) — glTF is Y-UP (spec 3.4: +Y up, right-handed): the
// vertices went out as (E, N, Z), so every surface stood on its edge in Blender or a glTF viewer. Now x = easting,
// y = elevation, z = -northing (a rotation: winding and normals are kept), and the extras say so.
export function exportSurfaceGLTF(name, geometry, origin, provenance = null, extra = {}) {
  const { vertices, indices } = sceneVertsToWorld(geometry, origin);
  const { offset, local } = localizeVertices(vertices); // #413
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(local.flatMap(([e, n, z]) => [e, z, -n]), 3)); // #1031 Y-up
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: sanitizeName(name) }));
  mesh.name = sanitizeName(name);
  // TASKS.csv #269 — glTF has no comment syntax, but GLTFExporter copies a node's userData into that
  // node's `extras` object, which is exactly what extras is for and what every glTF inspector shows.
  mesh.userData = { GeoStrix: provenanceLines(name, provenance, extra), localOrigin: offset, axes: "glTF Y-up: x = easting, y = elevation, z = -northing (metres)" }; // #413 / #1031
  mesh.position.set(offset[0], offset[2], -offset[1]); // written as node.translation (JSON doubles); #1031 Y-up
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      mesh,
      (result) => {
        geo.dispose();
        // binary:true below resolves an ArrayBuffer (.glb); non-binary would resolve a JSON object instead.
        resolve(result);
      },
      (err) => { geo.dispose(); reject(err); },
      { binary: true, trs: true }, // #413: trs -> node.translation (not a matrix), the readable form
    );
  });
}

function sanitizeName(name) {
  return String(name || "surface").replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 64) || "surface";
}
