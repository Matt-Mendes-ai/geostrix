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
  if (extra.epsg) out.push(`Project CRS: EPSG:${extra.epsg}`);
  if (extra.densityTPerM3 != null) out.push(`Bulk density used for tonnage: ${extra.densityTPerM3} t/m3 (assumed, not measured)`);
  if (extra.volumeM3 != null) out.push(`Enclosed volume: ${extra.volumeM3.toFixed(1)} m3 (in-situ, dry, undiluted, no recovery applied)`);
  // TASKS.csv #276 — this block was written for the numeric grade shell's params and assumed its fields
  // (element/cutoff/method/...). Every GemPy-generated surface and the #272 alteration halo now carry a
  // params block too, with a different shape, so the lines are emitted per available field instead of
  // per assumed field — an implicit surface exported with no cutoff no longer stamps "cutoff: undefined".
  if (provenance && provenance.tool && provenance.element == null) {
    const q = provenance;
    out.push(`Tool: ${q.tool}`);
    if (q.surface) out.push(`Surface: ${q.surface} | interface points: ${q.sourcePoints} | orientations: ${q.orientations}`);
    if (q.target) out.push(`Alteration assemblage: ${q.target} | indicator iso-level: ${q.isoLevel}`);
    if (q.relation) out.push(`Unit relationship: ${q.relation === "erode" ? "erode (each unit truncates those below — unconformity)" : "onlap (conformable pile, one shared interpolated field)"}`);
    if (q.resolution) out.push(`Model grid resolution: ${q.resolution.join(" x ")} cells`);
    if (q.gempyRange != null) out.push(`GemPy potential-field range: ${q.gempyRange}${q.gempyRangeDefault != null ? ` (GemPy default ${q.gempyRangeDefault}${q.gempyRangeMultiplier ? `, multiplier ${q.gempyRangeMultiplier}` : ", used as-is"})` : ""}${q.gempyCO != null ? ` | c_o: ${q.gempyCO}` : ""}`);
    if (q.method) out.push(`Interpolation: ${q.method} | search radius: ${Math.round(q.searchRadiusM)} m${q.searchRadiusAuto ? " (auto, from hole spacing)" : ""} | cell size: ${q.cellSizeM.toFixed ? q.cellSizeM.toFixed(2) : q.cellSizeM} m${q.cellSizeAuto ? " (auto)" : ""}${q.cellSizeCoarsened ? " — coarsened to stay under the grid limit" : ""}`);
    if (q.holeSpacingM != null) out.push(`Median hole spacing behind those auto values: ${Math.round(q.holeSpacingM)} m`);
    if (q.anisotropy) out.push(`Anisotropy trend: ${q.anisotropy.azimuth}/${q.anisotropy.dip} deg, ranges ${q.anisotropy.major}/${q.anisotropy.semiMajor}/${q.anisotropy.minor} m`);
    if (q.searchEllipsoid) out.push(`Search ellipsoid: ${q.searchEllipsoid.azimuth}/${q.searchEllipsoid.dip} deg, ranges ${q.searchEllipsoid.major}/${q.searchEllipsoid.semiMajor}/${q.searchEllipsoid.minor} m, min neighbours ${q.searchEllipsoid.minSamples}`);
    if (q.domain) out.push(`Model domain: ${q.domain}${q.clippedToDomain ? " (output mesh clipped to it)" : " (input points restricted to it)"}`);
    if (q.extent) out.push(`Modelled extent (project coords, origin-relative): ${q.extent.join(", ")}`);
    if (q.samplePoints != null) out.push(`Sample points: ${q.samplePoints}${q.alteredSamplePoints != null ? ` (${q.alteredSamplePoints} inside the assemblage)` : ""}${q.cellsEstimated != null ? ` | cells estimated: ${q.cellsEstimated}` : ""}`);
    if (q.closure) out.push(`Closure mode: ${q.closure}${q.closure === "artificial" ? " (part of the boundary is the search-radius wall, NOT a logged boundary)" : ""}`);
    if (q.generatedAt) out.push(`Generated: ${q.generatedAt}`);
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
    if (q.meanGradeInShell != null) out.push(`Mean interpolated grade inside the shell: ${q.meanGradeInShell.toFixed(3)} ${q.unit} (not a resource grade)`);
    out.push(`Generated: ${q.generatedAt}`);
  }
  out.push(`No anisotropy, no variogram, no classification, no dilution or recovery. Must not be reported publicly as a Mineral Resource under NI 43-101 or JORC.`);
  return out;
}

// OBJ — plain text, universally supported. 1-indexed faces per the OBJ spec.
export function exportSurfaceOBJ(name, geometry, origin, provenance = null, extra = {}) {
  const { vertices, indices } = sceneVertsToWorld(geometry, origin);
  const lines = [`# ${name} — exported from GeoStrix (TASKS.csv #143)`];
  provenanceLines(name, provenance, extra).forEach((l) => lines.push(`# ${l}`)); // TASKS.csv #269
  lines.push(`o ${sanitizeName(name)}`);
  for (const [x, y, z] of vertices) lines.push(`v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    lines.push(`f ${indices[t] + 1} ${indices[t + 1] + 1} ${indices[t + 2] + 1}`);
  }
  return lines.join("\n") + "\n";
}

// DXF (ASCII, R12-compatible subset) — one 3DFACE entity per triangle, the standard way to hand a
// triangulated surface to AutoCAD-family and most mining packages (Vulcan/Surpac both read 3DFACE
// meshes). Deliberately minimal: just a SECTION/ENTITIES block + EOF, skipping HEADER/TABLES/BLOCKS —
// every DXF reader tested against (a hand round-trip through a DXF-capable viewer, see this task's
// TASKS.csv verification note) accepts this; a full HEADER section only matters if the consumer needs
// $ACADVER-gated features, which a bare triangle mesh does not. A 3DFACE always carries 4 vertex codes
// (10/20/30 .. 13/23/33) even for a triangular face — the 4th vertex is conventionally a repeat of the
// 3rd, per the DXF spec, not a degenerate/invalid entity.
export function exportSurfaceDXF(name, geometry, origin, provenance = null, extra = {}) {
  const { vertices, indices } = sceneVertsToWorld(geometry, origin);
  const layer = sanitizeName(name).slice(0, 255) || "SURFACE";
  const lines = [];
  // TASKS.csv #269 — group code 999 is the DXF spec's own comment record; readers ignore it, humans
  // and grep don't. Written before the ENTITIES section so it sits at the top of the file.
  provenanceLines(name, provenance, extra).forEach((l) => lines.push("999", l));
  lines.push("0", "SECTION", "2", "ENTITIES");
  const fmt = (n) => n.toFixed(4);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = vertices[indices[t]], b = vertices[indices[t + 1]], c = vertices[indices[t + 2]];
    lines.push(
      "0", "3DFACE",
      "8", layer,
      "10", fmt(a[0]), "20", fmt(a[1]), "30", fmt(a[2]),
      "11", fmt(b[0]), "21", fmt(b[1]), "31", fmt(b[2]),
      "12", fmt(c[0]), "22", fmt(c[1]), "32", fmt(c[2]),
      "13", fmt(c[0]), "23", fmt(c[1]), "33", fmt(c[2]), // repeated 3rd vertex — standard for a triangular 3DFACE
    );
  }
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n") + "\n";
}

// glTF (binary .glb) — via three.js's own GLTFExporter, which handles the format's chunk/JSON/buffer
// structure correctly (hand-rolling glTF would be a lot of low-value bookkeeping three.js already
// solved). Builds a throwaway THREE.Mesh with WORLD-space vertices baked directly into its geometry
// (not via mesh.position/matrix, which would just relocate the object without changing what's actually
// written to the exported vertex buffer the way we need) so the same real-world-coordinate convention
// as the OBJ/DXF exporters applies here too.
export function exportSurfaceGLTF(name, geometry, origin, provenance = null, extra = {}) {
  const { vertices, indices } = sceneVertsToWorld(geometry, origin);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: sanitizeName(name) }));
  mesh.name = sanitizeName(name);
  // TASKS.csv #269 — glTF has no comment syntax, but GLTFExporter copies a node's userData into that
  // node's `extras` object, which is exactly what extras is for and what every glTF inspector shows.
  mesh.userData = { GeoStrix: provenanceLines(name, provenance, extra) };
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
      { binary: true },
    );
  });
}

function sanitizeName(name) {
  return String(name || "surface").replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 64) || "surface";
}
