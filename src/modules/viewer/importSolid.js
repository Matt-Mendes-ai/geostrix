// TASKS.csv #148 / #414 — import a DXF / OBJ / MSH / TS / GP solid as model surfaces (one per DXF layer or OBJ object), parsed in a worker.
// TASKS.csv #3996 — moved out of ViewerModule.jsx as it was (its cap, and the startup bundle: loaded on the first import). c: the viewer's
// setters and refs it uses.
import * as THREE from "three";
import { parseSolidInWorker } from "../../lib/solidImportClient.js"; // TASKS.csv #414
import { solidBounds, SOLID_FACE_WARN } from "../../lib/solidImportMeta.js"; // TASKS.csv #148; #552 split
import { tieOf } from "../../lib/localGridTie.js"; // TASKS.csv #3186
import { landed } from "../../lib/projectJobs.js"; // TASKS.csv #3953
import { askConfirm } from "../../lib/confirmDialog.js"; // TASKS.csv #3957
import { errorNotice, infoNotice, notice } from "../../lib/notices.js";
import { t as tr } from "../../lib/i18n.js";

// TASKS.csv #414 — imported solids, one tone per layer (grey-blue family: never the generated-surface gold).
const IMPORTED_SOLID_COLORS = [0x8fa3b8, 0xa89bbd, 0x8fb8aa, 0xbfae92, 0x93b3c4, 0xb89aa4];

export async function importSolidFile(c, file) {
  const { setTaskProgress, startProjectJob, setNotices, project, importStateRef, originRef, implicitMeshesRef, implicitGroupRef, setImplicitSurfaces, fitBox } = c;
    if (!file) return;
    // TASKS.csv #414 — parsed in a worker (a 1M-face DXF used to freeze the UI for ~11 s and take ~2 GB),
    // with progress in the status bar, and one surface per DXF layer / OBJ object instead of one merged mesh.
    const progLabel = `Reading ${file.name}`;
    const clearProgress = () => setTaskProgress((cur) => (cur && cur.label === progLabel ? null : cur));
    setTaskProgress({ label: progLabel, pct: 0 });
    const job = startProjectJob?.({ label: file.name }) || null; // TASKS.csv #3953 — the solid goes to the project it was imported in
    try {
      const solid = await parseSolidInWorker(file, (read, total) => setTaskProgress((cur) => (cur && cur.label === progLabel ? { ...cur, pct: Math.round((read / Math.max(1, total)) * 100) } : cur)));
      clearProgress();
      if (!(await landed(job))) return; // #3953
      const layered = solid.parts.length > 1;
      // #483: the saved size is the compact form (compactSurfaces.js, ~10 MB per million triangles measured); an
      // upper estimate here, at ~3 bytes per coordinate and ~2 per index, base64
      if (solid.triangleCount > SOLID_FACE_WARN && !await askConfirm(tr("\"{name}\" has {triangleCount} triangles{v}: it can slow the 3D view and add about {v2} MB to the project. Import it anyway?", { name: file.name, triangleCount: solid.triangleCount.toLocaleString(), v: layered ? tr(" in {parts} layers", { parts: solid.parts.length }) : "", v2: Math.round(((solid.vertexCount * 3 * 3 + solid.triangleCount * 3 * 2) * 4) / 3 / 1e6) }))) {
        setNotices((p) => [...p, notice("{name}: import cancelled ({triangleCount} triangles).", { name: file.name, triangleCount: solid.triangleCount.toLocaleString() })]);
        return;
      }
      // TASKS.csv #3186 — on a local grid tied to a real CRS: the file's numbers are local metres or the tie's CRS (one question, lib/solidTie.js)
      const gridTie = tieOf(project);
      let viaTie = false;
      if (gridTie) {
        const g = (await import("../../lib/solidTie.js")).solidTieGuess(solid.parts, gridTie, importStateRef.current?.collars);
        viaTie = await askConfirm(tr("Are the coordinates in \"{name}\" in EPSG:{epsg}, the CRS the local grid is tied to?{hint}\n\nOK: place them through the tie, onto the local grid. Cancel: use them as local-grid metres, as they are.", { epsg: gridTie.epsg, name: file.name, hint: g.suggest === "tie" ? tr("\n\nThe solid is about {d} m from the holes read that way, against {e} m as local metres: it looks like EPSG:{epsg}.", { d: Math.round(g.viaTieM).toLocaleString(), e: Math.round(g.asLocalM).toLocaleString(), epsg: gridTie.epsg }) : g.suggest === "local" ? tr("\n\nThe solid is about {e} m from the holes as local metres, against {d} m read through the tie: it looks like local-grid metres.", { d: Math.round(g.viaTieM).toLocaleString(), e: Math.round(g.asLocalM).toLocaleString() }) : "" }));
        if (viaTie) solid.parts = (await import("../../lib/solidTie.js")).solidPartsToLocal(solid.parts, gridTie);
      }
      const bounds = solidBounds(solid.parts);
      // TASKS.csv #3428 — more than 100 km from the holes froze the view for about a minute (fitted, with a scene origin that far): asked first, and
      // when imported anyway the view stays where it is
      const farSolid = (await import("../../lib/solidFar.js")).solidFarFromHoles(bounds, importStateRef.current?.collars);
      if (farSolid?.far && !await askConfirm(tr("\"{name}\" lies about {km} km from your holes (E {e}, N {n}): probably another coordinate system or a local grid. A solid that far can freeze the 3D view. Import it anyway? OK: import it and leave the view where it is. Cancel: don't import it.", { name: file.name, km: Math.round(farSolid.distM / 1000).toLocaleString(), e: Math.round(farSolid.solid[0]).toLocaleString(), n: Math.round(farSolid.solid[1]).toLocaleString() }))) {
        setNotices((p) => [...p, notice("{name}: import cancelled (it lies about {km} km from the holes).", { name: file.name, km: Math.round(farSolid.distM / 1000).toLocaleString() })]);
        return;
      }
      if (!(await landed(job))) return; // #3953 — again, right before it is added (the checks above take a moment)
      const o = originRef.current;
      const label = file.name.replace(/\.(dxf|obj|msh|ts|gp)$/i, "");
      const stamp = Date.now(), importedBefore = Object.keys(implicitMeshesRef.current).filter((i) => i.includes("_imported")).length;
      const box = new THREE.Box3();
      const added = solid.parts.map((part, k) => {
        // World (easting, northing, elevation) -> scene, the exact inverse of meshExport.js's
        // sceneVertsToWorld (scene x = east offset, y = elevation offset, z = -(north offset)).
        const w = part.positions, scene = new Float32Array(w.length);
        for (let i = 0; i < w.length; i += 3) { scene[i] = w[i] - o.x; scene[i + 1] = w[i + 2] - o.z; scene[i + 2] = o.y - w[i + 1]; }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(scene, 3));
        geo.setIndex(new THREE.BufferAttribute(part.indices, 1));
        // #483 — normals come from the worker in world axes; scene = (x, elevation, -north), a rotation, so
        // the same component swap applies. (The main-thread fallback parser has none: compute them here.)
        if (part.normals?.length === w.length) {
          const wn = part.normals, sn = new Float32Array(wn.length);
          for (let i = 0; i < wn.length; i += 3) { sn[i] = wn[i]; sn[i + 1] = wn[i + 2]; sn[i + 2] = -wn[i + 1]; }
          geo.setAttribute("normal", new THREE.BufferAttribute(sn, 3));
        } else geo.computeVertexNormals();
        // Translucent grey-blue family, visually distinct from the gold/coloured generated surfaces — an
        // imported reference shape should not look like something this app modelled. Layers get neighbouring
        // tones so a pit shell and its stopes can be told apart (the #52 sync-out saves the material colour).
        const color = IMPORTED_SOLID_COLORS[(k + importedBefore) % IMPORTED_SOLID_COLORS.length]; // #3762 — one drop of files, each its own tone
        const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
        const mesh = new THREE.Mesh(geo, mat);
        const name = layered ? `${label} — ${part.layer}` : label;
        const nVerts = w.length / 3, nTris = part.indices.length / 3;
        mesh.userData = { tip: `${name} (imported ${solid.format})\n${nVerts} vertices, ${nTris} triangles` };
        implicitGroupRef.current?.add(mesh);
        const id = `impl_${stamp}_imported${layered ? `_${k}` : ""}`;
        implicitMeshesRef.current[id] = mesh;
        // #491 — was box.expandByObject(mesh), which walks every vertex through the world matrix (~50 ms per
        // 250k vertices). The typed-array bounding box moved by the world matrix is the same box here: the
        // parents only translate and scale (vertical exaggeration).
        geo.computeBoundingBox();
        mesh.updateWorldMatrix(true, false);
        box.union(geo.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
        return {
          id, name: `${name} (imported)`, visible: true,
          vertexCount: nVerts, faceCount: nTris,
          type: "imported", relationships: [], closure: null,
          params: {
            tool: "imported solid", sourceFile: file.name, format: solid.format, ...(layered ? { layer: part.layer } : {}),
            detail: solid.note, vertices: nVerts, triangles: nTris,
            crsAssumed: viaTie ? `placed onto the local grid through its tie to EPSG:${gridTie.epsg} (x, y; elevation unchanged)` /* #3186 */ : project?.crsSet === false ? "assumed on the project's local grid (CRS not set)" /* #2232 */ : project?.epsg ? `assumed already in EPSG:${project.epsg}` : "assumed already in the project CRS",
            importedAt: new Date().toISOString(),
          },
        };
      });
      setImplicitSurfaces((p) => [...p, ...added]);
      const bb = bounds
        ? ` Extent: E ${bounds.min.x.toFixed(0)}–${bounds.max.x.toFixed(0)}, N ${bounds.min.y.toFixed(0)}–${bounds.max.y.toFixed(0)}, Z ${bounds.min.z.toFixed(0)}–${bounds.max.z.toFixed(0)}.`
        : "";
      const layerNote = layered ? tr(" One surface per {v} ({v2}).", { v: solid.format === "DXF" ? "layer" : "object", v2: solid.parts.map((p) => p.layer).join(", ") }) : "";
      setNotices((p) => [...p, viaTie ? notice("Imported \"{name}\" as a solid: {vertexCount} vertices / {triangleCount} triangles ({format}, {note}).{layerNote} It appears under Generated surfaces with the same show/hide, remove and query controls.{bb} Placed onto the local grid through its tie to EPSG:{epsg} (x and y; elevation unchanged).", { name: file.name, vertexCount: solid.vertexCount.toLocaleString(), triangleCount: solid.triangleCount.toLocaleString(), format: solid.format, note: solid.note, layerNote, bb, epsg: gridTie.epsg }) /* #3186 */ : notice("Imported \"{name}\" as a solid: {vertexCount} vertices / {triangleCount} triangles ({format}, {note}).{layerNote} It appears under Generated surfaces with the same show/hide, remove and query controls.{bb} Coordinates are used AS-IS — a DXF/OBJ carries no CRS, so GeoStrix does not reproject it; if it lands away from your holes, the file is in a different CRS.", { name: file.name, vertexCount: solid.vertexCount.toLocaleString(), triangleCount: solid.triangleCount.toLocaleString(), format: solid.format, note: solid.note, layerNote, bb })]);
      if (!farSolid?.far) fitBox(box); // #3428 — a far solid is imported where it is; the view is not moved to it
      import("../../lib/solidCheckNote.js").then(({ solidCheckNote }) => { const t = solidCheckNote(solid.parts, (k) => (layered ? `${label} — ${solid.parts[k].layer}` : label)); if (t) setNotices((p) => [...p, infoNotice(t)]); }).catch(() => {}); // #2801 — on demand
    } catch (e) {
      clearProgress();
      setNotices((p) => [...p, errorNotice(tr("{name}: couldn't import as a solid ({v}).", { name: file.name, v: e.message || e }))]); // #739
    } finally { job?.end(); }
}
