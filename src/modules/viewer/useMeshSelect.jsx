import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { viewNdc } from "../../lib/viewer/clickPoint.js";
import { stashSurface } from "./surfaceUndo.js";
import { t as tr } from "../../lib/i18n.js";

// TASKS.csv #3991 (Matt: "I should be able to select meshes individually and delete them"; his 'Top of DLST' was 2 separate pieces, a sheet
// and a blob, with no way to keep one) — click a mesh in the 3D view to select it: a highlight on it and a small bar with Delete, Hide, Zoom to
// and Properties; the Delete key deletes, Esc deselects, Ctrl+click adds or takes one off. A model surface of several separate pieces offers
// "Select a piece": a click then picks one piece (lib/meshPieces.js, the volume card's own pieces) for Delete this piece / Keep only this piece /
// Split into separate meshes. A piece edit puts new surfaces (new ids) in place of the old one in ONE update, so it is one Undo step
// (viewer/surfaceUndo.js: the old surface waits in the grave), its edit is recorded on the surface (the exports itemise it) and the volume card
// recomputes. Model surfaces (generated, solids, imported OBJ / DXF) and OMF surfaces are selectable; the block models are not.
// Live only while no other tool owns the click (ViewerModule calls handleViewClick then).
const HL = { whole: { color: "#ffcc00", opacity: 0.32 }, piece: { color: "#ff5a00", opacity: 0.62 } };
const overlayMaterial = ({ color, opacity }) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export function useMeshSelect(r) {
  const [sel, setSel] = useState([]); // [{ kind: "surface" | "omf", id }]
  const [pieces, setPieces] = useState(null); // { id, count, labels, sizes } for one selected model surface
  const [pieceMode, setPieceMode] = useState(false);
  const [piece, setPiece] = useState(null); // the selected piece's label
  const [busy, setBusy] = useState(false);
  const rr = useRef(r); rr.current = r;
  const wake = () => { if (rr.current.lastActivityRef) rr.current.lastActivityRef.current = Date.now(); };
  const clear = useCallback(() => { setSel([]); setPieceMode(false); setPiece(null); }, []);
  const meshOf = (it) => (it.kind === "surface" ? rr.current.implicitMeshesRef.current[it.id] : rr.current.omfMeshesRef.current[it.id]);
  const entryOf = (it) => (it.kind === "surface" ? (rr.current.implicitSurfaces || []).find((s) => s.id === it.id) : (rr.current.omfObjects || []).find((o) => o.id === it.id));

  // the selection follows the surfaces: one removed elsewhere (or by Undo) leaves it
  useEffect(() => {
    setSel((s) => { const k = s.filter((it) => entryOf(it) && meshOf(it)); return k.length === s.length ? s : k; });
  }, [r.implicitSurfaces, r.omfObjects]);

  // one model surface selected: its pieces (labelled once per geometry, cached; a worker for a big mesh)
  const one = sel.length === 1 && sel[0].kind === "surface" ? sel[0].id : null;
  useEffect(() => {
    setPieces(null); setPiece(null); setPieceMode(false);
    const mesh = one && rr.current.implicitMeshesRef.current[one];
    if (!mesh) return undefined;
    let live = true;
    import("../../lib/meshPiecesClient.js").then(({ piecesOf }) => piecesOf(mesh.geometry)).then((p) => { if (live && p) setPieces({ id: one, ...p }); }).catch(() => {});
    return () => { live = false; };
  }, [one, r.implicitSurfaces]);

  // the highlight: a see-through copy over each selected mesh (its own geometry, not drawn into the picking), the chosen piece stronger
  useEffect(() => {
    const made = [];
    const over = (mesh, geo, style) => { const o = new THREE.Mesh(geo, overlayMaterial(style)); o.raycast = () => {}; o.renderOrder = 10; o.userData.selectionOverlay = true; mesh.add(o); made.push(o); };
    for (const it of sel) { const m = meshOf(it); if (m?.isMesh && m.geometry) over(m, m.geometry, HL.whole); }
    let pieceGeo = null, live = true;
    if (piece != null && pieces && one === pieces.id) {
      const m = rr.current.implicitMeshesRef.current[one];
      if (m?.geometry?.index) {
        import("../../lib/meshPieces.js").then(({ keepPieces }) => {
          if (!live || !m.parent) return;
          const kp = keepPieces(m.geometry.attributes.position.array, m.geometry.index.array, pieces.labels, new Set([piece])); // the piece alone, a compact copy
          pieceGeo = new THREE.BufferGeometry();
          pieceGeo.setAttribute("position", new THREE.BufferAttribute(kp.positions, 3)); pieceGeo.setIndex(new THREE.BufferAttribute(kp.index, 1));
          over(m, pieceGeo, HL.piece); wake();
        });
      }
    }
    wake();
    return () => { live = false; for (const o of made) { o.parent?.remove(o); o.material.dispose(); } pieceGeo?.dispose(); wake(); };
  }, [sel, piece, pieces, r.implicitSurfaces]);

  // a click on the view (no other tool armed)
  const handleViewClick = (e) => {
    const c = rr.current, mount = c.mountRef.current, cam = c.cameraRef.current;
    if (!mount || !cam) return;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(viewNdc(e, mount.getBoundingClientRect(), c.mcDownRef.current), cam);
    const owners = new Map();
    for (const [id, m] of Object.entries(c.implicitMeshesRef.current || {})) if (m) owners.set(m, { kind: "surface", id });
    for (const [id, m] of Object.entries(c.omfMeshesRef.current || {})) if (m) owners.set(m, { kind: "omf", id });
    const shown = (o) => { for (let x = o; x; x = x.parent) if (x.visible === false) return false; return true; };
    let hit = null, it = null;
    for (const h of c.pickHits(rc)) {
      for (let o = h.object; o; o = o.parent) { const w = owners.get(o); if (w && shown(o)) { hit = h; it = w; break; } }
      if (it) break;
    }
    if (!it) { if (!(e.ctrlKey || e.metaKey)) clear(); return; }
    if (pieceMode && pieces && it.kind === "surface" && it.id === pieces.id && Number.isInteger(hit.faceIndex)) { setPiece(pieces.labels[hit.faceIndex] ?? null); return; }
    if (e.ctrlKey || e.metaKey) { setSel((s) => (s.some((x) => x.kind === it.kind && x.id === it.id) ? s.filter((x) => !(x.kind === it.kind && x.id === it.id)) : [...s, it])); return; }
    setSel([it]);
  };

  // whole meshes: delete, hide, zoom, properties
  const deleteSel = () => {
    const c = rr.current;
    for (const it of sel) if (it.kind === "surface") c.removeImplicitSurface(it.id); else c.removeOmfObject(it.id);
    clear();
  };
  const hideSel = () => {
    const c = rr.current;
    for (const it of sel) { const en = entryOf(it); if (!en || en.visible === false) continue; if (it.kind === "surface") c.toggleImplicitSurface(it.id); else c.updateOmfObject(it.id, { visible: false }); }
    clear();
  };
  const zoomSel = () => {
    const box = new THREE.Box3();
    for (const it of sel) { const m = meshOf(it); if (m) box.expandByObject(m); }
    if (!box.isEmpty()) rr.current.fitBox(box, 1.5);
  };

  // a piece edit: the surface replaced by the meshes it leaves, in one update (one Undo step)
  const editPieces = async (kind) => {
    const c = rr.current, id = pieces?.id, s = (c.implicitSurfaces || []).find((x) => x.id === id), mesh = c.implicitMeshesRef.current[id];
    if (!s || !mesh?.geometry?.index || busy) return;
    setBusy(true);
    try {
      const [{ pieceParts, keepPieces, pieceName, pieceEdit }, { computeMeshVolume }] = await Promise.all([import("../../lib/meshPieces.js"), import("../../lib/volumetrics.js")]);
      const parts = pieceParts(kind, pieces.count, piece);
      if (!parts) return;
      const geo = mesh.geometry, pos = geo.attributes.position.array, idx = geo.index.array, before = computeMeshVolume(geo), at = new Date().toISOString();
      const made = parts.map((p, k) => {
        const kp = keepPieces(pos, idx, pieces.labels, p.keep), g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(kp.positions, 3)); g.setIndex(new THREE.BufferAttribute(kp.index, 1)); g.computeVertexNormals();
        const m = new THREE.Mesh(g, mesh.material.clone()); m.userData = { tip: mesh.userData?.tip }; m.visible = mesh.visible; m.renderOrder = mesh.renderOrder;
        const v = computeMeshVolume(g), nid = `impl_${Date.now()}_${k}_piece`;
        const edit = pieceEdit(kind, { count: pieces.count, label: p.piece ?? piece, facesBefore: idx.length / 3, facesAfter: kp.faces, volumeBeforeM3: before?.watertight ? before.volumeM3 : null, volumeAfterM3: v?.watertight ? v.volumeM3 : null, at });
        const n = (s.editCount || 0) + 1;
        const entry = { ...s, id: nid, name: p.piece != null ? pieceName(s.name, p.piece + 1, pieces.count) : s.name, vertexCount: kp.vertices, faceCount: kp.faces, edited: true, editCount: n, edits: [...(s.edits || []), edit].slice(-50),
          params: s.params ? { ...s.params, manuallyEdited: true, manualEditCount: n, lastManualEditAt: at, ...(s.params.volumeM3 != null ? { volumeM3: v?.watertight ? Math.round(v.volumeM3) : null } : {}) } : s.params };
        if (k > 0) delete entry.supersedes; // the first stands in the old one's place in its versions
        return { entry, mesh: m };
      });
      stashSurface({ grave: c.surfaceGrave.current, meshes: c.implicitMeshesRef.current, group: c.implicitGroupRef.current, surfaces: c.surfacesNowRef.current }, id);
      for (const { entry, mesh: m } of made) { c.implicitGroupRef.current?.add(m); c.implicitMeshesRef.current[entry.id] = m; }
      const first = made[0].entry.id;
      c.setImplicitSurfaces((p) => {
        const i = p.findIndex((x) => x.id === id), out = p.map((x) => (x.id === id ? x : { ...x, ...(x.supersedes === id ? { supersedes: first } : {}), relationships: (x.relationships || []).map((q) => (q.targetId === id ? { ...q, targetId: first } : q)) }));
        out.splice(i < 0 ? out.length : i, i < 0 ? 0 : 1, ...made.map((x) => x.entry));
        return out;
      });
      c.setExplicitSurfaces?.((p) => (p.some((d) => d.surfaceId === id) ? p.map((d) => (d.surfaceId === id ? { ...d, surfaceId: first } : d)) : p)); // its definition follows it (undo-tracked: Undo puts it back)
      if (c.expandedSurfaceId === id) c.setExpandedSurfaceId(first);
      setSel([{ kind: "surface", id: first }]); setPiece(null); setPieceMode(false); wake();
    } finally { setBusy(false); }
  };

  // keys: Delete deletes (the piece when one is chosen), Esc steps back (the piece, then the selection)
  useEffect(() => {
    if (!sel.length) return undefined;
    const k = (e) => {
      const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing) return;
      if (e.key === "Delete") { e.preventDefault(); if (piece != null) editPieces("delete"); else deleteSel(); }
      else if (e.key === "Escape") { if (piece != null || pieceMode) { setPiece(null); setPieceMode(false); } else clear(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  let bar = null;
  if (sel.length) {
    const b = { padding: "2px 8px", border: "1px solid var(--color-border)", borderRadius: 3, background: "var(--color-bg)", cursor: "pointer", fontSize: "var(--font-size-sm)" };
    const en = sel.length === 1 ? entryOf(sel[0]) : null, hasPieces = pieces && pieces.id === one && pieces.count > 1;
    bar = (
      <div data-mesh-select="" role="toolbar" aria-label={tr("Selected mesh")} style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", maxWidth: "90%", padding: "4px 8px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,0.18)", fontSize: "var(--font-size-sm)" }}>
        <b style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en ? en.name : tr("{n} meshes selected", { n: sel.length })}</b>
        {piece == null ? (<>
          <button type="button" style={b} onClick={deleteSel}>{tr("Delete")}</button>
          <button type="button" style={b} onClick={hideSel}>{tr("Hide")}</button>
          <button type="button" style={b} onClick={zoomSel}>{tr("Zoom to")}</button>
          {one && <button type="button" style={b} onClick={() => rr.current.setExpandedSurfaceId(one)}>{tr("Properties")}</button>}
          {hasPieces && <button type="button" style={{ ...b, ...(pieceMode ? { background: "var(--color-selected-bg)" } : {}) }} aria-pressed={pieceMode} onClick={() => setPieceMode((v) => !v)}>{tr("Select a piece")}</button>}
          {hasPieces && pieceMode && <span style={{ color: "var(--color-text-muted)" }}>{tr("Click one of its {n} pieces.", { n: pieces.count })}</span>}
        </>) : (<>
          <span>{tr("Piece {k} of {n}", { k: piece + 1, n: pieces.count })}</span>
          <button type="button" style={b} disabled={busy} onClick={() => editPieces("delete")}>{tr("Delete this piece")}</button>
          <button type="button" style={b} disabled={busy} onClick={() => editPieces("keep")}>{tr("Keep only this piece")}</button>
          <button type="button" style={b} disabled={busy} onClick={() => editPieces("split")}>{tr("Split into separate meshes")}</button>
        </>)}
        <button type="button" onClick={clear} aria-label={tr("Clear the selection")} title={tr("Clear the selection")} style={{ ...b, border: "none", background: "none", fontSize: "var(--font-size-lg)", lineHeight: 1 }}>×</button>
      </div>
    );
  }
  return { handleViewClick, bar, selected: sel };
}
