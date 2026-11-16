// TASKS.csv #90 / #52 (d) — the topology check and the cross-cut (truncate against a dyke, split on a fault), moved out of ViewerModule.jsx
// verbatim to make room under its size cap (TASKS.csv #1084; side 1, 2026-11-15). No behaviour change: the same two buttons call them.
import { useCallback, useState } from "react";
import * as THREE from "three";
import { t as tr } from "../../lib/i18n.js";
import { errorNotice, notice, appendNotice, replaceNotices } from "../../lib/notices.js";

export function useSurfaceChecks({ implicitSurfaces, surfaceLabels, implicitMeshesRef, implicitGroupRef, surfaceGeomCacheRef, setNotices, setImplicitSurfaces }) {
  // ---------- TASKS.csv #90 — topological relationship checking ----------
  // The consumer #83 was missing. Runs src/lib/topology.js over every surface currently in the scene,
  // using their #83 declared relationships, and reports the ones the GEOMETRY contradicts. Meshes are
  // handed over in SCENE space (up = +Y) — the check is scale/frame-agnostic, and this avoids
  // converting tens of thousands of vertices just to ask a yes/no question.
  const [topologyBusy, setTopologyBusy] = useState(false);
  const runTopologyCheck = useCallback(() => {
    if (!implicitSurfaces.length) { setNotices((p) => [...p, notice("No generated surfaces to check yet.")]); return; }
    setTopologyBusy(true);
    // Deferred a tick so the "Checking..." state actually paints before a multi-second check on large
    // meshes blocks the main thread — same pattern the modelling tools use for their own busy state.
    setTimeout(async () => {
      try {
        const { checkTopology, FOLD_EXPLAIN, STEEP_DIP_DEG } = await import("../../lib/topology.js"); // #90; loaded on first use (#476); the fold-back reading and the steep threshold: #3777 (a static import of them pulled all of topology.js, 6.8 kB, into the startup chunk)
        const input = implicitSurfaces.map((s) => {
          const geo = implicitMeshesRef.current[s.id]?.geometry;
          const pos = geo?.attributes?.position?.array;
          const idx = geo?.index?.array;
          return {
            id: s.id, name: surfaceLabels.get(s.id) ?? s.name, type: s.type, closure: s.closure, // #1550
            relationships: s.relationships || [],
            positions: pos || [], indices: idx || [],
          };
        });
        const res = checkTopology(input, { up: "y" });
        // TASKS.csv #3777 — the steep surfaces not tested for fold-back, named; and the reading of a fold-back said once after the list, not after every surface
        const steepNote = res.steep?.length ? " " + tr("Not tested for fold-back ({list}: they dip over {deg}° on average, and a steep contact has two elevations at one location).", { list: res.steep.map((s) => `${s.name} ${s.dip}°`).join(", "), deg: STEEP_DIP_DEG }) : "";
        const foldWhy = res.violations.some((v) => v.kind === "inverted") ? " " + tr(FOLD_EXPLAIN) : "";
        if (!res.checked) {
          setNotices((p) => replaceNotices(p, "topologyCheck", notice("Nothing to check: none of the {surfacesChecked} surface(s) declare a relationship that implies a geometric constraint. Declare \"is below\" / \"is above\" / \"must not cross\" on a surface (expand its row) and run this again.", { surfacesChecked: res.surfacesChecked }))); // #3114
        } else if (!res.violations.length) {
          setNotices((p) => replaceNotices(p, "topologyCheck", notice("Topology check passed: {checked} check(s) across {surfacesChecked} surface(s), no violations.{v}", { checked: res.checked, surfacesChecked: res.surfacesChecked, v: (res.skipped ? tr(" {skipped} declared relationship(s) skipped — either the target surface no longer exists, or the relationship (truncates / terminates against / cuts) is one where an intersection is expected and so has nothing to violate.", { skipped: res.skipped }) : "") + steepNote }))); // #3114
        } else {
          setNotices((p) => replaceNotices(p, "topologyCheck", appendNotice(notice("Topology check found {violations} violation(s) in {checked} check(s):", { violations: res.violations.length, checked: res.checked }), res.violations.map((v) => ` • ${v.message}`).join("") + foldWhy + steepNote))); // #3114 — replaces the last check's notice // #1542 — one notice: the count and the list stay together
        }
      } catch (err) {
        setNotices((p) => replaceNotices(p, "topologyCheck", errorNotice(tr("Topology check failed: {message}", { message: err.message }))));
      } finally {
        setTopologyBusy(false);
      }
    }, 40);
  }, [implicitSurfaces, surfaceLabels]);

  // ---------- TASKS.csv #52 (d) — CROSS-CUTTING: truncate a surface against a dyke, split it on a fault ----------
  // A stack (#61) leaves veins and dykes out by design, so cross-cutting is applied after the fact to the finished meshes (src/lib/crosscut.js,
  // checked against planted cases: TASKS.csv #52). The cutter's geometry decides: a closed body truncates the host, an open surface splits it
  // into two fault blocks. Meshes in SCENE space (up = +Y), as #90's checker.
  const [crossCutBusy, setCrossCutBusy] = useState(false);
  const runCrossCut = useCallback((hostId, cutterId) => {
    const host = implicitSurfaces.find((s) => s.id === hostId);
    const cutter = implicitSurfaces.find((s) => s.id === cutterId);
    if (!host || !cutter || hostId === cutterId) return;
    const hostMesh = implicitMeshesRef.current[hostId], cutMesh = implicitMeshesRef.current[cutterId];
    if (!hostMesh || !cutMesh) { setNotices((p) => [...p, notice("Cross-cut failed: one of the two surfaces has no mesh in the scene.")]); return; }
    const geoOf = (m) => ({ positions: m.geometry?.attributes?.position?.array || [], indices: m.geometry?.index?.array || [] });
    setCrossCutBusy(true);
    setTimeout(async () => {
      try {
        const { truncateAgainstSolid, splitAcrossSurface } = await import("../../lib/crosscut.js"); // #52 (d); loaded on first use (#476)
        const h = geoOf(hostMesh), c = geoOf(cutMesh);
        const mkGeo = (positions, indices) => {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(positions), 3));
          g.setIndex(Array.from(indices));
          g.computeVertexNormals();
          return g;
        };
        const res = truncateAgainstSolid(h, c);
        if (!res.ok && res.reason === "cutter-not-closed") {
          // Not an error — it is the fault case, and the fault case is a SPLIT, not a truncation.
          const { orientMesh } = await import("../../lib/meshValidate.js"); // #1058 — the side test reads each fault triangle's normal
          const sp = splitAcrossSurface(h, { positions: c.positions, indices: orientMesh(c.positions, c.indices).indices });
          if (!sp.ok || !sp.changed) {
            setNotices((p) => [...p, notice("\"{name}\" does not divide \"{name2}\": {v}. Nothing was changed.", { name: cutter.name, name2: host.name, v: sp.reason === "no-overlap" ? tr("the two surfaces are nowhere near each other") : tr("the whole surface falls on one side of it") })]);
            return;
          }
          const stamp = (part, suffix, sense) => {
            const mesh = new THREE.Mesh(mkGeo(part.positions, part.indices), new THREE.MeshLambertMaterial({
              color: hostMesh.material?.color?.getHex?.() ?? 0xc8a24a, side: THREE.DoubleSide, transparent: true, opacity: hostMesh.material?.opacity ?? 0.75,
            }));
            const name = `${host.name} — ${suffix}`;
            mesh.userData = { tip: `${name}\n${Math.floor(part.positions.length / 3)} vertices, ${Math.floor(part.indices.length / 3)} faces` };
            implicitGroupRef.current?.add(mesh);
            const id = `impl_${Date.now()}_block_${sense}_${Math.random().toString(36).slice(2, 7)}`;
            implicitMeshesRef.current[id] = mesh;
            return {
              id, name, visible: true, type: host.type || "other",
              vertexCount: Math.floor(part.positions.length / 3), faceCount: Math.floor(part.indices.length / 3),
              relationships: [{ relation: "terminates_against", targetId: cutterId }],
              params: {
                tool: "fault block split" /* TASKS.csv #52 */, derivedFrom: host.name, fault: cutter.name, block: sense,
                triangles: Math.floor(part.indices.length / 3), components: sense === "+" ? sp.stats.positiveComponents : sp.stats.negativeComponents,
                edgesBeyondTheFaultTip: sp.stats.unresolvedEdges,
                note: tr("Geometry only: the surface is divided where the fault mesh cuts it. NO fault displacement is applied — the blocks are not offset along the fault, because no slip has been measured here."),
                sourceParams: host.params || null, generatedAt: new Date().toISOString(),
              },
            };
          };
          const a = stamp(sp.positive, "block (+ side of fault)", "+");
          const b = stamp(sp.negative, "block (− side of fault)", "-");
          hostMesh.visible = false;
          setImplicitSurfaces((p) => [...p.map((s) => (s.id === hostId ? { ...s, visible: false } : s)), a, b]);
          setNotices((p) => [...p, notice("Split \"{name}\" along fault \"{name2}\": {faceCount} + {faceCount2} triangles in two blocks. The original surface is kept but hidden, so nothing is lost. NO displacement has been applied — the blocks are exactly where the surface already was, just separated at the fault.", { name: host.name, name2: cutter.name, faceCount: a.faceCount.toLocaleString(), faceCount2: b.faceCount.toLocaleString() })]);
          if (sp.stats.unresolvedEdges > 0) {
            setNotices((p) => [...p, notice("\"{name}\" does not span the whole of \"{name2}\": {unresolvedEdges} edge(s) change sides beyond the fault's own extent, where it has no surface to cut against. Those triangles were left whole and assigned to the block holding most of their corners rather than cut at an invented position, so read the division as approximate near the fault's tip.", { name: cutter.name, name2: host.name, unresolvedEdges: sp.stats.unresolvedEdges })]);
          }
          return;
        }
        if (!res.ok) { setNotices((p) => [...p, errorNotice(tr("Cross-cut failed ({reason}).", { reason: res.reason }))]); return; }
        if (!res.changed) {
          setNotices((p) => [...p, notice("\"{name}\" does not cut \"{name2}\" — {v}. Nothing was changed, which is the correct result: a dyke that stops short of a contact does not truncate it.", { name: cutter.name, name2: host.name, v: res.reason === "no-overlap" ? tr("the two bodies do not even overlap in space") : tr("no part of the surface falls inside it") })]);
          return;
        }
        // Replace the geometry (a NEW BufferGeometry, so the #52 sync-out cache keyed on geometry uuid
        // re-serialises it and the truncation actually reaches the project file).
        const old = hostMesh.geometry;
        hostMesh.geometry = mkGeo(res.positions, res.indices);
        old?.dispose?.();
        delete surfaceGeomCacheRef.current[hostId];
        const st = res.stats;
        const vertexCount = Math.floor(res.positions.length / 3), faceCount = Math.floor(res.indices.length / 3);
        hostMesh.userData = { tip: `${host.name}\n${vertexCount} vertices, ${faceCount} faces (truncated against ${cutter.name})` };
        setImplicitSurfaces((p) => p.map((s) => {
          if (s.id === hostId) {
            return {
              ...s, vertexCount, faceCount,
              relationships: [...(s.relationships || []).filter((r) => !(r.relation === "cuts" && r.targetId === cutterId)), { relation: "cuts", targetId: cutterId }],
              params: {
                ...(s.params || {}),
                truncatedBy: [...((s.params || {}).truncatedBy || []), {
                  cutter: cutter.name, cutterId,
                  trianglesRemoved: st.trianglesDropped, trianglesClipped: st.trianglesClipped,
                  componentsBefore: st.componentsBefore, componentsAfter: st.componentsAfter,
                  openEdgeLengthBeforeM: st.boundaryLengthBeforeM, openEdgeLengthAfterM: st.boundaryLengthAfterM,
                  at: new Date().toISOString(),
                }],
              },
            };
          }
          if (s.id === cutterId) {
            return { ...s, relationships: [...(s.relationships || []).filter((r) => !(r.relation === "truncates" && r.targetId === hostId)), { relation: "truncates", targetId: hostId }] };
          }
          return s;
        }));
        const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
        setNotices((p) => [...p, notice("Truncated \"{name}\" against \"{name2}\": {v} triangle(s) removed and {v2} cut at the contact, leaving {v3}. {v4} Its open edge went from {v5} m to {v6} m.", { name: host.name, name2: cutter.name, v: fmt(st.trianglesDropped), v2: fmt(st.trianglesClipped), v3: fmt(faceCount), v4: st.componentsAfter > st.componentsBefore ? tr("The body cuts right through it — the surface is now {componentsAfter} separate pieces (was {componentsBefore}).", { componentsAfter: st.componentsAfter, componentsBefore: st.componentsBefore }) : tr("The surface is still {componentsAfter} connected piece(s), so the cut is a notch rather than a full severance.", { componentsAfter: st.componentsAfter }), v5: fmt(st.boundaryLengthBeforeM), v6: fmt(st.boundaryLengthAfterM) })]);
        setNotices((p) => [...p, notice("The truncation is not re-run automatically: regenerating either surface produces a fresh, untruncated mesh, and the cut has to be applied again. What was cut is recorded in \"{name}\"'s Parameters used.", { name: host.name })]);
      } catch (err) {
        setNotices((p) => [...p, errorNotice(tr("Cross-cut failed: {message}", { message: err.message }))]);
      } finally {
        setCrossCutBusy(false);
      }
    }, 40);
  }, [implicitSurfaces]);
  return { topologyBusy, runTopologyCheck, crossCutBusy, runCrossCut };
}
