import React, { useMemo, useState } from "react";
import { X, GitCompare, Download, Layers, Check } from "lucide-react";
import { buildMeshQuery, closestPointOnMesh } from "../lib/meshQuery.js";
import { computeMeshVolume } from "../lib/volumetrics.js";
import { buildLineages, compareSurfaceGeometry, diffParams, editDisclosure } from "../lib/surfaceVersions.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// TASKS.csv #93 — COMPARE TWO VERSIONS OF A SURFACE.
//
// The #93 row asked for "a side-by-side or overlay compare view". This is deliberately BOTH, with the
// weight on the numbers rather than the picture:
//
//   * A QUANTITATIVE DIFF is the primary output — volume delta, surface-to-surface separation
//     (mean/median/p95/max, both directions), watertightness, connected-body count, and the list of
//     parameters that actually changed between the two runs. Two grade shells at 0.3 vs 0.5 g/t look
//     almost identical when overlaid and orbited; "+412,000 m3, mean separation 6.8 m, max 41 m, and
//     the only setting you changed was the cutoff" is the answer a geologist can act on. It is also
//     far cheaper to render than a second scene.
//   * THE OVERLAY IS ONE BUTTON, not a second viewport. Both versions are already real meshes in the
//     one scene (see surfaceVersions.js on why the storage shape keeps them that way), so "show both
//     in contrasting colours" costs two material writes — no second renderer, no second camera, no
//     extra draw-call budget on the modest hardware this app targets. A true split-screen viewport
//     would double the per-frame cost of the heaviest part of the app, which is the wrong trade here.
//
// HONESTY (TASKS.csv "Resource estimation (QP review)" precedent). A version is a RECORD OF A RUN.
// Nothing here says either version is correct, closer to reality, or better supported by the data —
// only what changed between them. "Accept" marks which one the user is working from; it is a label,
// not a validation, and the wording in the UI says so.
//
// HAND EDITS (#145) ARE DISCLOSED FIRST. If either side was sculpted after generation, the difference
// below is not attributable to the parameter change alone. The export provenance already leads with
// that disclosure; so does this dialog, above the numbers rather than in a footnote.
export default function SurfaceCompareModal({
  surfaces = [], getMesh, onOverlay, onClearOverlay, onAccept, initialId = null, onClose,
}) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238

  const { lineages, byId } = useMemo(() => buildLineages(surfaces), [surfaces]);
  // Default to the lineage the user opened this from, if it has more than one version in it.
  const initialLineage = useMemo(() => {
    const hit = initialId ? byId.get(initialId) : null;
    if (hit && hit.lineage.length > 1) return hit.lineage;
    return lineages.find((l) => l.length > 1) || null;
  }, [initialId, byId, lineages]);

  const [lineageRootId, setLineageRootId] = useState(initialLineage ? initialLineage[0].id : "");
  const lineage = useMemo(() => {
    const l = lineages.find((x) => x[0].id === lineageRootId);
    return l || initialLineage || [];
  }, [lineages, lineageRootId, initialLineage]);

  const [aId, setAId] = useState(() => (initialLineage && initialLineage.length > 1 ? initialLineage[initialLineage.length - 2].id : ""));
  const [bId, setBId] = useState(() => (initialLineage && initialLineage.length > 1 ? initialLineage[initialLineage.length - 1].id : ""));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const surfA = lineage.find((s) => s.id === aId) || null;
  const surfB = lineage.find((s) => s.id === bId) || null;

  // Parameter diff and hand-edit disclosure are free (no geometry touched), so they render immediately
  // on selection; only the geometry diff waits for the button.
  const paramDiff = useMemo(() => (surfA && surfB ? diffParams(surfA.params, surfB.params) : null), [surfA, surfB]);
  const edits = useMemo(() => (surfA && surfB ? editDisclosure(surfA, surfB) : null), [surfA, surfB]);

  // Deliberately NOT a useMemo that fires on selection. Building two BVHs over ~50k triangles each and
  // running tens of thousands of exact closest-point queries costs a few hundred milliseconds; doing
  // that on every dropdown change would make the dialog feel broken on the hardware this app targets.
  // Performance is priority #1 — so the user asks for it, once, and gets a progress state while it runs.
  const runCompare = () => {
    if (!surfA || !surfB) return;
    setError(null);
    setBusy(true);
    // Yield a frame so the "Comparing…" label paints before the synchronous work blocks the thread.
    setTimeout(() => {
      try {
        const ma = getMesh?.(surfA.id), mb = getMesh?.(surfB.id);
        if (!ma?.positions || !mb?.positions) throw new Error("one of these versions has no mesh in the scene");
        const t0 = performance.now();
        const r = compareSurfaceGeometry(ma, mb, { buildMeshQuery, closestPointOnMesh, computeMeshVolume });
        setResult(r ? { ...r, ms: Math.round(performance.now() - t0) } : null);
      } catch (e) {
        setError(e.message || String(e));
        setResult(null);
      }
      setBusy(false);
    }, 30);
  };

  const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fmt0 = (v) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString());

  const exportCsv = () => {
    if (!surfA || !surfB) return;
    const lines = [
      "GeoStrix surface version comparison — a record of two runs, NOT evidence that either is correct.",
      `Exported,${new Date().toISOString()}`,
      `Version A (older),"${(surfA.name || "").replace(/"/g, '""')}"`,
      `Version B (newer),"${(surfB.name || "").replace(/"/g, '""')}"`,
      "",
    ];
    if (edits?.message) lines.push(`HAND-EDIT WARNING,"${edits.message.replace(/"/g, '""')}"`, "");
    lines.push("section,item,version A,version B");
    if (result) {
      lines.push(`geometry,vertices,${result.a.vertexCount},${result.b.vertexCount}`);
      lines.push(`geometry,triangles,${result.a.triangleCount},${result.b.triangleCount}`);
      lines.push(`geometry,watertight,${result.a.watertight ? "yes" : "no"},${result.b.watertight ? "yes" : "no"}`);
      lines.push(`geometry,open edges,${result.a.openEdgeCount},${result.b.openEdgeCount}`);
      lines.push(`geometry,connected bodies,${result.a.componentCount ?? ""},${result.b.componentCount ?? ""}`);
      if (result.bothClosed) {
        lines.push(`volume,enclosed m3,${result.a.volumeM3.toFixed(1)},${result.b.volumeM3.toFixed(1)}`);
        lines.push(`volume,delta m3,,${result.volumeDeltaM3.toFixed(1)}`);
        lines.push(`volume,delta %,,${result.volumeDeltaPct == null ? "" : result.volumeDeltaPct.toFixed(2)}`);
      } else {
        lines.push("volume,enclosed m3,not applicable — at least one version is an open surface,");
      }
      const sep = (label, s) => s && lines.push(`separation,${label} mean m,${s.meanM.toFixed(3)},`, `separation,${label} median m,${s.medianM.toFixed(3)},`, `separation,${label} p95 m,${s.p95M.toFixed(3)},`, `separation,${label} max m,${s.maxM.toFixed(3)},`, `separation,${label} vertices sampled,${s.sampled} of ${s.totalVertices},`);
      sep("B vertices -> A surface", result.bToA);
      sep("A vertices -> B surface", result.aToB);
      lines.push(`separation,symmetric mean m,${result.meanSeparationM == null ? "" : result.meanSeparationM.toFixed(3)},`);
      lines.push(`separation,sampled two-sided Hausdorff (lower bound) m,${result.maxSeparationM == null ? "" : result.maxSeparationM.toFixed(3)},`);
    }
    (paramDiff?.changed || []).forEach((c) => lines.push(`parameter changed,${c.key},"${c.fromText}","${c.toText}"`));
    (paramDiff?.outcomes || []).forEach((c) => lines.push(`outcome changed,${c.key},"${c.fromText}","${c.toText}"`));
    (paramDiff?.onlyA || []).forEach((k) => lines.push(`parameter only in A,${k},,`));
    (paramDiff?.onlyB || []).forEach((k) => lines.push(`parameter only in B,${k},,`));
    saveFile({
      suggestedName: `version_compare_${(surfB.name || "surface").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
      content: lines.join("\n"), encoding: "text",
    });
  };

  const multiVersionLineages = lineages.filter((l) => l.length > 1);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 7 }}>
            <GitCompare size={14} /> Compare model versions
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        {multiVersionLineages.length === 0 ? (
          <div style={{ padding: "24px 8px", fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 560 }}>
            No surface has more than one version yet. Re-run a modelling tool with different parameters,
            then expand the new surface in the Generated surfaces list and set <em>“New version of…”</em>{" "}
            to the run it replaces. Both runs stay in the project — linking them only records that one
            descends from the other, so they can be compared here.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
              <label style={rowLabel}>
                Lineage
                <select
                  value={lineage[0]?.id || ""}
                  onChange={(e) => {
                    const l = lineages.find((x) => x[0].id === e.target.value) || [];
                    setLineageRootId(e.target.value);
                    setAId(l.length > 1 ? l[l.length - 2].id : "");
                    setBId(l.length > 1 ? l[l.length - 1].id : "");
                    setResult(null);
                  }}
                  style={{ ...sel, minWidth: 240 }}
                >
                  {multiVersionLineages.map((l) => (
                    <option key={l[0].id} value={l[0].id}>{l[0].name} — {l.length} versions</option>
                  ))}
                </select>
              </label>
              <label style={rowLabel}>
                Version A (older)
                <select value={aId} onChange={(e) => { setAId(e.target.value); setResult(null); }} style={{ ...sel, minWidth: 210 }}>
                  {lineage.map((s, i) => <option key={s.id} value={s.id}>v{i + 1} · {s.name}</option>)}
                </select>
              </label>
              <label style={rowLabel}>
                Version B (newer)
                <select value={bId} onChange={(e) => { setBId(e.target.value); setResult(null); }} style={{ ...sel, minWidth: 210 }}>
                  {lineage.map((s, i) => <option key={s.id} value={s.id}>v{i + 1} · {s.name}</option>)}
                </select>
              </label>
              <button onClick={runCompare} disabled={!surfA || !surfB || surfA === surfB || busy} style={{ ...primaryBtn, opacity: !surfA || !surfB || surfA === surfB || busy ? 0.5 : 1 }}>
                <GitCompare size={12} /> {busy ? "Comparing…" : "Compare geometry"}
              </button>
              {(result || paramDiff) && <button onClick={exportCsv} style={{ ...ghostBtn, marginLeft: "auto" }}><Download size={12} /> Export CSV</button>}
            </div>

            {surfA && surfB && surfA.id === surfB.id && (
              <div style={warnNote}>Pick two different versions.</div>
            )}

            {/* HAND-EDIT DISCLOSURE — above the numbers, never below them. */}
            {edits?.message && (
              <div style={{ ...warnNote, marginBottom: 8 }}>
                <strong>Hand-edited after generation.</strong> {edits.message}
                {edits.a.volumeDeltaM3 != null && <div style={{ marginTop: 4 }}>Older version’s sculpting changed its enclosed volume by {edits.a.volumeDeltaM3 >= 0 ? "+" : ""}{fmt0(edits.a.volumeDeltaM3)} m³.</div>}
                {edits.b.volumeDeltaM3 != null && <div style={{ marginTop: 4 }}>Newer version’s sculpting changed its enclosed volume by {edits.b.volumeDeltaM3 >= 0 ? "+" : ""}{fmt0(edits.b.volumeDeltaM3)} m³.</div>}
              </div>
            )}

            {paramDiff && !paramDiff.sameTool && (
              <div style={{ ...warnNote, marginBottom: 8 }}>
                These two were produced by <strong>different tools</strong> ({paramDiff.toolA || "unknown"} vs {paramDiff.toolB || "unknown"}).
                They can still be compared geometrically, but their parameter sets are not the same kind of thing,
                so “what changed” below is a list of two different vocabularies rather than a settings diff.
              </div>
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* ---------- WHAT CHANGED IN THE PARAMETERS (free — every run stores its own block) ---------- */}
              <div style={{ flex: "1 1 330px", minWidth: 300 }}>
                <div style={sectionLabel}>Parameters that changed</div>
                {!paramDiff ? <div style={muted}>Select two versions.</div> : (
                  <>
                    {paramDiff.changed.length === 0 && paramDiff.onlyA.length === 0 && paramDiff.onlyB.length === 0 ? (
                      <div style={muted}>
                        No recorded setting differs between these two runs
                        {paramDiff.unchangedCount ? ` (${paramDiff.unchangedCount} compared)` : ""}.
                        If the geometry still differs, the inputs did — the drillhole data, a domain, or an
                        excluded intercept changed between the runs, and none of those live in the parameter block.
                      </div>
                    ) : (
                      <table style={tbl}>
                        <thead><tr><th style={th}>Setting</th><th style={th}>A</th><th style={th}>B</th></tr></thead>
                        <tbody>
                          {paramDiff.changed.map((c) => (
                            <tr key={c.key}><td style={td}>{c.key}</td><td style={{ ...td, color: "var(--color-danger-icon)" }}>{c.fromText}</td><td style={{ ...td, color: "#1a4a9c", fontWeight: 600 }}>{c.toText}</td></tr>
                          ))}
                          {paramDiff.onlyA.map((k) => <tr key={`a_${k}`}><td style={td}>{k}</td><td style={td}>recorded</td><td style={{ ...td, color: "var(--color-text-muted)" }}>not recorded</td></tr>)}
                          {paramDiff.onlyB.map((k) => <tr key={`b_${k}`}><td style={td}>{k}</td><td style={{ ...td, color: "var(--color-text-muted)" }}>not recorded</td><td style={td}>recorded</td></tr>)}
                        </tbody>
                      </table>
                    )}
                    {paramDiff.outcomes.length > 0 && (
                      <>
                        <div style={{ ...sectionLabel, marginTop: 10 }}>Results that changed (outputs, not settings)</div>
                        <table style={tbl}>
                          <tbody>
                            {paramDiff.outcomes.map((c) => (
                              <tr key={c.key}><td style={td}>{c.key}</td><td style={td}>{c.fromText}</td><td style={{ ...td, fontWeight: 600 }}>{c.toText}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                    <div style={hint}>
                      Read straight from each run’s own stored parameter block (TASKS #269/#270) — the same
                      record every mesh export stamps into its file. Costs nothing to compute.
                    </div>
                  </>
                )}
              </div>

              {/* ---------- GEOMETRY DIFF ---------- */}
              <div style={{ flex: "1 1 330px", minWidth: 300 }}>
                <div style={sectionLabel}>Geometry</div>
                {error && <div style={warnNote}>Couldn’t compare: {error}</div>}
                {!result && !error && <div style={muted}>Press “Compare geometry”. This builds a spatial index over both meshes and measures the true point-to-surface distance for every vertex — a few hundred milliseconds on a full-size shell, so it runs on request rather than on every dropdown change.</div>}
                {result && (
                  <>
                    {result.identical && (
                      <div style={{ ...goodNote, marginBottom: 8 }}>
                        These two meshes are <strong>geometrically identical</strong> — same triangle count and zero separation
                        everywhere. Whatever changed between the runs did not move the surface.
                      </div>
                    )}
                    <table style={tbl}>
                      <thead><tr><th style={th}></th><th style={th}>A (older)</th><th style={th}>B (newer)</th></tr></thead>
                      <tbody>
                        <tr><td style={td}>Vertices</td><td style={td}>{result.a.vertexCount.toLocaleString()}</td><td style={td}>{result.b.vertexCount.toLocaleString()}</td></tr>
                        <tr><td style={td}>Triangles</td><td style={td}>{result.a.triangleCount.toLocaleString()}</td><td style={td}>{result.b.triangleCount.toLocaleString()}</td></tr>
                        <tr><td style={td}>Watertight</td><td style={td}>{result.a.watertight ? "yes" : `no (${result.a.openEdgeCount} open edges)`}</td><td style={td}>{result.b.watertight ? "yes" : `no (${result.b.openEdgeCount} open edges)`}</td></tr>
                        <tr><td style={td}>Separate bodies</td><td style={td}>{result.a.componentCount ?? "—"}</td><td style={td}>{result.b.componentCount ?? "—"}</td></tr>
                        {result.bothClosed && <tr><td style={td}>Enclosed volume</td><td style={td}>{fmt0(result.a.volumeM3)} m³</td><td style={td}>{fmt0(result.b.volumeM3)} m³</td></tr>}
                      </tbody>
                    </table>

                    {result.bothClosed ? (
                      <div style={{ ...bigStat, marginTop: 8 }}>
                        Volume change: <strong style={{ color: result.volumeDeltaM3 >= 0 ? "#1a4a9c" : "var(--color-danger-icon)" }}>
                          {result.volumeDeltaM3 >= 0 ? "+" : ""}{fmt0(result.volumeDeltaM3)} m³
                        </strong>
                        {result.volumeDeltaPct != null && <> ({result.volumeDeltaPct >= 0 ? "+" : ""}{fmt(result.volumeDeltaPct, 1)}%)</>}
                        <div style={hint}>Exploration target volume only — not a Mineral Resource, in either version.</div>
                      </div>
                    ) : (
                      <div style={{ ...warnNote, marginTop: 8 }}>
                        At least one version is an <strong>open surface</strong> (a draped contact, a fault plane, or a shell
                        clipped by a domain or the grid edge), so there is no enclosed volume to difference. The separation
                        figures below are still exact.
                      </div>
                    )}

                    <div style={{ ...sectionLabel, marginTop: 10 }}>How far the surface moved</div>
                    <table style={tbl}>
                      <thead><tr><th style={th}>Direction</th><th style={th}>mean</th><th style={th}>median</th><th style={th}>p95</th><th style={th}>max</th></tr></thead>
                      <tbody>
                        {result.bToA && <tr><td style={td}>B → A</td><td style={td}>{fmt(result.bToA.meanM)} m</td><td style={td}>{fmt(result.bToA.medianM)} m</td><td style={td}>{fmt(result.bToA.p95M)} m</td><td style={td}>{fmt(result.bToA.maxM)} m</td></tr>}
                        {result.aToB && <tr><td style={td}>A → B</td><td style={td}>{fmt(result.aToB.meanM)} m</td><td style={td}>{fmt(result.aToB.medianM)} m</td><td style={td}>{fmt(result.aToB.p95M)} m</td><td style={td}>{fmt(result.aToB.maxM)} m</td></tr>}
                      </tbody>
                    </table>
                    <div style={{ ...bigStat, marginTop: 8 }}>
                      Mean separation <strong>{fmt(result.meanSeparationM)} m</strong> · largest measured separation <strong>{fmt(result.maxSeparationM)} m</strong>
                    </div>
                    <div style={hint}>
                      Exact point-to-triangle distance (not nearest-vertex), measured both ways because a one-way
                      figure misses anything the other version has and this one doesn’t. The maximum is a
                      <strong> lower bound</strong> on the true worst-case difference: distances are measured from each
                      mesh’s vertices, so a bulge in the middle of a large triangle with no vertex on it isn’t sampled.
                      {result.sampledOnly && <> Vertices were <strong>subsampled</strong> at a fixed stride ({result.bToA?.sampled.toLocaleString()} of {result.bToA?.totalVertices.toLocaleString()} on B, {result.aToB?.sampled.toLocaleString()} of {result.aToB?.totalVertices.toLocaleString()} on A) to keep this responsive — the stride is deterministic, so these numbers are reproducible, but the maximum is sampled more coarsely than the mesh allows.</>}
                      {" "}Computed in {result.ms} ms.
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ---------- OVERLAY + ACCEPT ---------- */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid #eef0f3", flexWrap: "wrap" }}>
              <button onClick={() => surfA && surfB && onOverlay?.(surfA.id, surfB.id)} disabled={!surfA || !surfB} style={{ ...ghostBtn, opacity: surfA && surfB ? 1 : 0.5 }} title="Show both versions in the 3D view in contrasting colours (older grey-blue, newer orange) and hide the rest of the lineage. Uses the meshes already in the scene — no second viewport.">
                <Layers size={12} /> Overlay both in the 3D view
              </button>
              <button onClick={() => onClearOverlay?.()} style={ghostBtn} title="Put the compared surfaces back to their own colours.">Reset colours</button>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                {surfA && <button onClick={() => onAccept?.(surfA.id)} style={acceptBtn} title={`Mark "${surfA.name}" as the accepted version of this lineage`}><Check size={12} /> Accept A</button>}
                {surfB && <button onClick={() => onAccept?.(surfB.id)} style={acceptBtn} title={`Mark "${surfB.name}" as the accepted version of this lineage`}><Check size={12} /> Accept B</button>}
              </div>
            </div>
            <div style={hint}>
              Accepting a version marks it as the one you are working from and hides the others in this
              lineage — it does <strong>not</strong> delete them, and it is not a statement that the accepted run is
              correct. Nothing in this dialog validates either version against the ground; it reports what
              differs between two records of two runs.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(20,24,30,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.3)", width: 880, maxWidth: "94vw", maxHeight: "94vh", overflow: "auto" };
const rowLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
const primaryBtn = { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border-light)", background: "#e8eef8", color: "#1a4a9c", fontSize: "var(--font-size-base)", cursor: "pointer" };
const ghostBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border-light)", background: "transparent", color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)", cursor: "pointer" };
const acceptBtn = { ...ghostBtn, background: "#f1f7f2", borderColor: "#c6e0cb", color: "#20512f" };
const sectionLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, margin: "6px 0 5px" };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" };
const th = { textAlign: "left", padding: "5px 7px", background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 600 };
const td = { padding: "4px 7px", borderBottom: "1px solid #eef0f3", color: "var(--color-text)", whiteSpace: "nowrap" };
const muted = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 };
const bigStat = { fontSize: "var(--font-size-base)", color: "var(--color-text)" };
const goodNote = { background: "#f1f7f2", border: "1px solid #c6e0cb", borderRadius: 6, padding: "7px 9px", fontSize: "var(--font-size-sm)", color: "#20512f", lineHeight: 1.5 };
const warnNote = { background: "#fdf6ec", border: "1px solid #e6d3b3", borderRadius: 6, padding: "7px 9px", fontSize: "var(--font-size-sm)", color: "var(--color-warn-text-strong)", lineHeight: 1.5 };
const hint = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 7, lineHeight: 1.5 };
