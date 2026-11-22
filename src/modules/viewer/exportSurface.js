// TASKS.csv #269 / #411 / #798 / #1101 / #3149 — export one model surface (OBJ, TS, DXF, glTF, VTK, OMF, or the run's GemPy inputs), every format
// stamped with the surface's provenance and edit log. TASKS.csv #3996 — moved out of ViewerModule.jsx as it was (its cap, and the startup
// bundle: loaded on the first export). c: the viewer's state, setters and refs it uses.
import { ensureExportCrs } from "../../lib/projectCrsRequest.js"; // TASKS.csv #1021
import { computeMeshVolume } from "../../lib/volumetrics.js";
import { supportedFaces } from "../../lib/explicitSupport.js"; // TASKS.csv #1103
import { version as APP_VERSION } from "../../../package.json"; // TASKS.csv #1034
import { saveFile } from "../../lib/desktop.js";
import { errorNotice, notice } from "../../lib/notices.js";
import { t as tr } from "../../lib/i18n.js";

export async function exportImplicitSurface(c, id, format) {
  const { implicitMeshesRef, implicitSurfaces, project, originRef, setNotices } = c;
    const mesh = implicitMeshesRef.current[id];
    const surf = implicitSurfaces.find((s) => s.id === id);
    if (!mesh?.geometry || !surf) return;
    const crsUnset = project?.crsSet === false; // #2225: a mesh's numbers ARE the local grid; no CRS is asked or written
    const epsg = crsUnset ? null : await ensureExportCrs(project); if (!crsUnset && !epsg) return; // TASKS.csv #1021 — not the placeholder
    const baseName = (surf.name || "surface").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
    // TASKS.csv #269 — every exported mesh carries its own parameter provenance + the "not a Mineral
    // Resource estimate" stamp, so it can't come back later stripped of the assumptions behind it.
    const prov = surf.params || null;
    // TASKS.csv #1028 (review #1016) — "Enclosed volume" only for a closed mesh: an open sheet has no inside, and the
    // signed-tetrahedron sum it got depends on the scene origin (1.65 / 165 / 137 Mm3 for one sheet)
    const vol = computeMeshVolume(mesh.geometry);
    const extra = { epsg, crsUnset, dataCredit: project?.dataCredit /* #3717 */, densityTPerM3: surf.density ?? null, volumeM3: vol.watertight ? vol.volumeM3 : null, ...(vol.watertight ? {} : { openSurface: true }) };
    // TASKS.csv #145 — a hand-sculpted surface must not leave this app claiming to be a clean
    // interpolation of its stated parameters. The edit log travels with the mesh (see
    // meshExport.js's provenanceLines, where it is stamped ahead of every parameter line), including
    // the volume as generated vs. the volume now, since volume is what drives tonnage.
    if (surf.editCount > 0) {
      const edits = surf.edits || [];
      extra.manualEdits = {
        count: surf.editCount,
        edits,
        volumeAsGeneratedM3: edits.length ? edits[0].volumeBeforeM3 : null,
        volumeNowM3: extra.volumeM3,
      };
    }
    try {
      let res = null; // #1042 — "Exported" only when the file was written; Cancel says nothing
      const { exportSurfaceOBJ, exportSurfaceTS /* #3149 */, exportSurfaceDXF, exportSurfaceGLTF, sceneVertsToWorld, sceneVertsToWorldFlat, worldBoxOf, provenanceLines } = await import("../../lib/meshExport.js"); // #600 startup budget
      extra.appVersion = APP_VERSION; // #1053
      extra.worldBox = worldBoxOf(sceneVertsToWorldFlat(mesh.geometry, originRef.current).vertices); // #1053 — in the file's own coordinates
      // TASKS.csv #1103 — an explicit surface's extrapolated margin is marked in DXF (own layer), VTK and OMF (per-face "supported")
      const hull = surf.type === "explicit_surface" ? surf.params?.supportHull : null;
      const supportedOf = (vertices, indices) => (hull ? supportedFaces(Float64Array.from(vertices.flat()), Array.from(indices.flat ? indices.flat() : indices), hull) : null);
      if (format === "inputs") {
        // TASKS.csv #1101 — the points and orientations the run sent, for every surface of that run, as GemPy tables
        const { runSurfaces, gempyInputFiles } = await import("../../lib/gempyInputs.js");
        const { buildZip } = await import("../../lib/shapefile.js");
        const run = runSurfaces(implicitSurfaces, surf);
        if (!run.length) { setNotices((p) => [...p, notice("This surface was made before GeoStrix kept a run's inputs: run it again to export them.")]); return; }
        const enc = new TextEncoder();
        const files = gempyInputFiles(run, provenanceLines(surf.name, prov, extra)).map((f) => ({ name: f.name, data: enc.encode(f.text) }));
        res = await saveFile({ quiet: true, suggestedName: `${baseName}_model_inputs.zip`, filters: [{ name: "ZIP", extensions: ["zip"] }], content: buildZip(files) });
      } else if (format === "obj") {
        const content = exportSurfaceOBJ(surf.name, mesh.geometry, originRef.current, prov, extra, { bytes: true }); // #1072 — UTF-8 bytes, not one huge string
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.obj`, filters: [{ name: "Wavefront OBJ", extensions: ["obj"] }], content });
      } else if (format === "ts") { // TASKS.csv #3149 (#2928 (7)) — GOCAD TSurf, side 5's writer
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.ts`, filters: [{ name: "GOCAD TSurf", extensions: ["ts"] }], content: exportSurfaceTS(surf.name, mesh.geometry, originRef.current, prov, extra, { bytes: true }) });
      } else if (format === "dxf") {
        const w = hull ? sceneVertsToWorld(mesh.geometry, originRef.current) : null;
        const content = exportSurfaceDXF(surf.name, mesh.geometry, originRef.current, prov, extra, { bytes: true, supported: w ? supportedOf(w.vertices, w.indices) : null }); // #1072; supported: #1103
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.dxf`, filters: [{ name: "AutoCAD DXF", extensions: ["dxf"] }], content });
      } else if (format === "glb") {
        const buf = await exportSurfaceGLTF(surf.name, mesh.geometry, originRef.current, prov, extra);
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.glb`, filters: [{ name: "glTF Binary", extensions: ["glb"] }], content: new Uint8Array(buf) /* #1040 bytes */ });
      } else if (format === "vtk") {
        // TASKS.csv #798 — legacy VTK polydata for ParaView / PyVista (pv.read)
        const { surfaceToVtk } = await import("../../lib/vtkExport.js");
        const { vertices, indices } = sceneVertsToWorld(mesh.geometry, originRef.current);
        const content = surfaceToVtk(surf.name, vertices, indices, `v${APP_VERSION} | ${epsg ? `EPSG:${epsg}` : "local grid, no CRS"}${surf.editCount > 0 ? `, hand-edited ${surf.editCount} time(s)` : ""}`, supportedOf(vertices, indices)); // #1103
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.vtk`, filters: [{ name: "VTK (legacy)", extensions: ["vtk"] }], content, encoding: "text" });
      } else if (format === "omf") {
        // TASKS.csv #411 — OMF v1 for Leapfrog / Datamine / Vulcan / Micromine (writer loaded on first use)
        const { writeOMF } = await import("../../lib/omfWriter.js");
        const { vertices, indices } = sceneVertsToWorld(mesh.geometry, originRef.current);
        // TASKS.csv #1053 — the whole stamp (not-a-resource, parameters, edit log, CRS), as OBJ / DXF / glTF carry it: OMF
        // is the Leapfrog / Datamine / Vulcan hand-off, and its description was one line
        const desc = provenanceLines(surf.name, prov, extra).join("\n");
        const bytes = await writeOMF({ name: surf.name, description: desc, elements: [{ type: "surface", name: surf.name, description: desc, vertices: vertices.flat(), triangles: indices.flat(), ...(() => { const sp = supportedOf(vertices, indices); return sp ? { data: [{ name: "supported", description: "1 = within the inputs, 0 = extrapolated beyond them", values: Array.from(sp), location: "faces" }] } : {}; })() }] });
        res = await saveFile({ quiet: true, suggestedName: `${baseName}.omf`, filters: [{ name: "Open Mining Format", extensions: ["omf"] }], content: bytes /* #1040 bytes */ });
      }
      if (!res?.ok) { if (res?.error) throw new Error(res.error); return; }
      setNotices((p) => [...p, notice("Exported \"{name}\" as {format} (real-world coordinates).", { name: surf.name, format: format === "ts" ? "GOCAD TSurf" : format.toUpperCase() })]);
    } catch (err) {
      setNotices((p) => [...p, errorNotice(tr("Export failed for \"{name}\": {message}", { name: surf.name, message: err.message }))]);
    }
}
