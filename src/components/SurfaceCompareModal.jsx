import React, { useMemo, useState } from "react";
import { Download, Layers, Check } from "./icons.js";
import { buildMeshQuery, closestPointOnMesh } from "../lib/meshQuery.js";
import { computeMeshVolume } from "../lib/volumetrics.js";
import { buildLineages, compareSurfaceGeometry, diffParams, editDisclosure } from "../lib/surfaceVersions.js";
import { saveFile } from "../lib/desktop.js";
import { toCsv, FORMULA_LEAD } from "../lib/tabular.js"; // TASKS.csv #1082
import { surfaceCompareRows } from "../lib/tableExports.js"; // TASKS.csv #1083
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import StepDialog, { stepDialogStyles } from "./StepDialog.jsx"; // TASKS.csv #4073
import { StepNumbers } from "./StepPane.jsx";

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
// TASKS.csv #4073 — on the shared StepDialog: 1 Versions (the lineage and A / B pre-filled with its last two runs; the hand-edit disclosure and the settings
// that changed, free), 2 Result (the geometry as numbers, the overlay and Accept, Export CSV). The explanations are in the Help card.
export default function SurfaceCompareModal({
  surfaces = [], getMesh, onOverlay, onClearOverlay, onAccept, initialId = null, onClose,
}) {
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
  const [step, setStep] = useState(0);

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
        if (!ma?.positions || !mb?.positions) throw new Error(tr("one of these versions has no mesh in the scene"));
        const t0 = performance.now();
        const r = compareSurfaceGeometry(ma, mb, { buildMeshQuery, closestPointOnMesh, computeMeshVolume });
        setResult(r ? { ...r, ms: Math.round(performance.now() - t0) } : null);
        if (r) setStep(1);
      } catch (e) {
        setError(tr("Couldn’t compare: {error}", { error: e.message || String(e) }));
        setResult(null);
      }
      setBusy(false);
    }, 30);
  };

  const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fmt0 = (v) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString());

  // TASKS.csv #1082 (review #1016) — rows of cells written by Papa (tabular.toCsv): the hand-built lines did not double
  // the quotes inside a parameter value (mapModel.order ["Andesite","Tuff"] split into 6 fields)
  const exportCsv = () => {
    if (!surfA || !surfB) return;
    const rows = surfaceCompareRows({ nameA: surfA.name, nameB: surfB.name, exported: new Date().toISOString(), editsMessage: edits?.message, result, paramDiff }); // #1083 — rows in lib, tested
    saveFile({
      suggestedName: `version_compare_${(surfB.name || "surface").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
      content: toCsv(rows, { escapeFormulae: FORMULA_LEAD }), encoding: "text",
    });
  };

  const multiVersionLineages = lineages.filter((l) => l.length > 1);
  const heading = tr("Compare model versions");
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-accent-dark)", marginBottom: 6, cursor: "pointer" }}>{tr("How it works")}</summary>
      <div style={note}><b>{tr("Parameters that changed")}</b> {tr("Read straight from each run’s own stored parameter block — the same record every mesh export stamps into its file. Costs nothing to compute.")}</div>
      <div style={note}><b>{tr("Geometry")}</b> {tr("Exact point-to-triangle distance (not nearest-vertex), measured both ways, since one way misses what only the other version has. The maximum is a")}{" "}{tr("lower bound")}{" "}{tr("on the true worst case: distances are measured from mesh vertices, so a bulge inside a large triangle with no vertex on it is missed.")}</div>
      <div style={note}><b>{tr("Accept A")} / {tr("Accept B")}</b> {tr("Accepting a version marks it as the one you are working from and hides the others in this lineage — it does")}{" "}{tr("not")}{" "}{tr("delete them, nor say the accepted run is correct. Nothing here checks either version against the ground; it reports what differs between two runs.")}</div>
    </details>
  );
  if (multiVersionLineages.length === 0) {
    return <StepDialog title={heading} onClose={onClose} help={help} width="min(600px, 96vw)" at={0} onAt={() => {}}
      steps={[{ key: "none", label: heading, render: () => <div style={{ ...note, maxWidth: 560 }}>{tr("No surface has more than one version yet. Re-run a modelling tool with different parameters, then expand the new surface in the Generated surfaces list and set")}{" "}<em>{tr("“New version of…”")}</em>{" "}{tr("to the run it replaces. Both runs stay in the project; the link only records that one descends from the other.")}</div>, primary: { label: tr("Close"), onClick: onClose } }]} />;
  }
  const same = surfA && surfB && surfA.id === surfB.id;
  const versions = (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={rowLabel}>{tr("Lineage")}<select
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
              <option key={l[0].id} value={l[0].id}>{tr("{name} — {l} versions", { name: l[0].name, l: l.length })}</option>
            ))}
          </select>
        </label>
        <label style={rowLabel}>{tr("Version A (older)")}<select value={aId} onChange={(e) => { setAId(e.target.value); setResult(null); }} style={{ ...sel, minWidth: 210 }}>
            {lineage.map((s, i) => <option key={s.id} value={s.id}>v{i + 1} · {s.name}</option>)}
          </select>
        </label>
        <label style={rowLabel}>{tr("Version B (newer)")}<select value={bId} onChange={(e) => { setBId(e.target.value); setResult(null); }} style={{ ...sel, minWidth: 210 }}>
            {lineage.map((s, i) => <option key={s.id} value={s.id}>v{i + 1} · {s.name}</option>)}
          </select>
        </label>
      </div>
      {/* HAND-EDIT DISCLOSURE — above the numbers, never below them. */}
      {edits?.message && (
        <div style={warn}>
          <strong>{tr("Hand-edited after generation.")}</strong> {edits.message}
          {edits.a.volumeDeltaM3 != null && <div style={{ marginTop: 4 }}>{tr("Older version’s sculpting changed its enclosed volume by {v}{v2} m³.", { v: edits.a.volumeDeltaM3 >= 0 ? "+" : "", v2: fmt0(edits.a.volumeDeltaM3) })}</div>}
          {edits.b.volumeDeltaM3 != null && <div style={{ marginTop: 4 }}>{tr("Newer version’s sculpting changed its enclosed volume by {v}{v2} m³.", { v: edits.b.volumeDeltaM3 >= 0 ? "+" : "", v2: fmt0(edits.b.volumeDeltaM3) })}</div>}
        </div>
      )}
      {paramDiff && !paramDiff.sameTool && (
        <div style={warn}>{tr("These two were produced by")}{" "}<strong>{tr("different tools")}</strong>{" "}{tr("({v} vs {v2}). They can still be compared geometrically, but “what changed” below lists two different sets of parameters, not a settings diff.", { v: paramDiff.toolA || tr("unknown"), v2: paramDiff.toolB || tr("unknown") })}</div>
      )}
      {/* ---------- WHAT CHANGED IN THE PARAMETERS (free — every run stores its own block) ---------- */}
      <div>
        <div style={label}>{tr("Parameters that changed")}</div>
        {!paramDiff ? <div style={note}>{tr("Select two versions.")}</div> : (
          <>
            {paramDiff.changed.length === 0 && paramDiff.onlyA.length === 0 && paramDiff.onlyB.length === 0 ? (
              <div style={note}>{tr("No recorded setting differs between these two runs{v}. If the geometry still differs, the inputs did: the drillhole data, a domain or an excluded intercept.", { v: paramDiff.unchangedCount ? ` (${paramDiff.unchangedCount} compared)` : "" })}</div>
            ) : (
              <table style={tbl}>
                <thead><tr><th style={th}>{tr("Setting")}</th><th style={th}>A</th><th style={th}>B</th></tr></thead>
                <tbody>
                  {paramDiff.changed.map((c) => (
                    <tr key={c.key}><td style={td}>{c.key}</td><td style={{ ...td, color: "var(--color-danger-icon)" }}>{c.fromText}</td><td style={{ ...td, color: "var(--color-accent-dark)", fontWeight: 600 }}>{c.toText}</td></tr>
                  ))}
                  {paramDiff.onlyA.map((k) => <tr key={`a_${k}`}><td style={td}>{k}</td><td style={td}>{tr("recorded")}</td><td style={{ ...td, color: "var(--color-text-muted)" }}>{tr("not recorded")}</td></tr>)}
                  {paramDiff.onlyB.map((k) => <tr key={`b_${k}`}><td style={td}>{k}</td><td style={{ ...td, color: "var(--color-text-muted)" }}>{tr("not recorded")}</td><td style={td}>{tr("recorded")}</td></tr>)}
                </tbody>
              </table>
            )}
            {paramDiff.outcomes.length > 0 && (
              <>
                <div style={{ ...label, marginTop: 10 }}>{tr("Results that changed (outputs, not settings)")}</div>
                <table style={tbl}>
                  <tbody>
                    {paramDiff.outcomes.map((c) => (
                      <tr key={c.key}><td style={td}>{c.key}</td><td style={td}>{c.fromText}</td><td style={{ ...td, fontWeight: 600 }}>{c.toText}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
  const geometry = result && (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 300px", minWidth: 280, display: "flex", flexDirection: "column", gap: 6 }}>
        {result.identical && <div style={good}>{tr("These two meshes are")}{" "}<strong>{tr("geometrically identical")}</strong>{" "}{tr("— same triangle count and zero separation everywhere. Whatever changed between the runs did not move the surface.")}</div>}
        <div style={{ maxWidth: 380 }}><StepNumbers rows={[
          result.bothClosed && { label: tr("Volume change"), value: `${result.volumeDeltaM3 >= 0 ? "+" : ""}${fmt0(result.volumeDeltaM3)} m³${result.volumeDeltaPct != null ? ` (${result.volumeDeltaPct >= 0 ? "+" : ""}${fmt(result.volumeDeltaPct, 1)}%)` : ""}` },
          { label: tr("Mean separation"), value: `${fmt(result.meanSeparationM)} m` },
          { label: tr("Largest separation"), value: `${fmt(result.maxSeparationM)} m`, title: tr("lower bound") },
        ]} /></div>
        {result.bothClosed ? <div style={note}>{tr("Exploration target volume only — not a Mineral Resource, in either version.")}</div>
          : <div style={warn}>{tr("At least one version is an")}{" "}<strong>{tr("open surface")}</strong>{" "}{tr("(a draped contact, fault plane, or shell clipped by a domain or grid edge), so there is no volume difference. The separations below are still exact.")}</div>}
        <table style={tbl}>
          <thead><tr><th style={th}></th><th style={th}>{tr("A (older)")}</th><th style={th}>{tr("B (newer)")}</th></tr></thead>
          <tbody>
            <tr><td style={td}>{tr("Vertices")}</td><td style={td}>{result.a.vertexCount.toLocaleString()}</td><td style={td}>{result.b.vertexCount.toLocaleString()}</td></tr>
            <tr><td style={td}>{tr("Triangles")}</td><td style={td}>{result.a.triangleCount.toLocaleString()}</td><td style={td}>{result.b.triangleCount.toLocaleString()}</td></tr>
            <tr><td style={td}>{tr("Watertight")}</td><td style={td}>{result.a.watertight ? "yes" : tr("no ({openEdgeCount} open edges)", { openEdgeCount: result.a.openEdgeCount })}</td><td style={td}>{result.b.watertight ? "yes" : tr("no ({openEdgeCount} open edges)", { openEdgeCount: result.b.openEdgeCount })}</td></tr>
            <tr><td style={td}>{tr("Separate bodies")}</td><td style={td}>{result.a.componentCount ?? "—"}</td><td style={td}>{result.b.componentCount ?? "—"}</td></tr>
            {result.bothClosed && <tr><td style={td}>{tr("Enclosed volume")}</td><td style={td}>{fmt0(result.a.volumeM3)} m³</td><td style={td}>{fmt0(result.b.volumeM3)} m³</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ flex: "1 1 300px", minWidth: 280, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={label}>{tr("How far the surface moved")}</div>
        <table style={tbl}>
          <thead><tr><th style={th}>{tr("Direction")}</th><th style={th}>{tr("mean")}</th><th style={th}>{tr("median")}</th><th style={th}>p95</th><th style={th}>{tr("max")}</th></tr></thead>
          <tbody>
            {result.bToA && <tr><td style={td}>B → A</td><td style={td}>{fmt(result.bToA.meanM)} m</td><td style={td}>{fmt(result.bToA.medianM)} m</td><td style={td}>{fmt(result.bToA.p95M)} m</td><td style={td}>{fmt(result.bToA.maxM)} m</td></tr>}
            {result.aToB && <tr><td style={td}>A → B</td><td style={td}>{fmt(result.aToB.meanM)} m</td><td style={td}>{fmt(result.aToB.medianM)} m</td><td style={td}>{fmt(result.aToB.p95M)} m</td><td style={td}>{fmt(result.aToB.maxM)} m</td></tr>}
          </tbody>
        </table>
        {result.sampledOnly && <div style={note}>{tr("Vertices were")}{" "}<strong>{tr("subsampled")}</strong>{" "}{tr("at a fixed stride ({v} of {v2} on B, {v3} of {v4} on A) to stay responsive; the numbers are reproducible, but the maximum is coarser than the mesh allows.", { v: result.bToA?.sampled.toLocaleString(), v2: result.bToA?.totalVertices.toLocaleString(), v3: result.aToB?.sampled.toLocaleString(), v4: result.aToB?.totalVertices.toLocaleString() })}</div>}
        <div style={note}>{tr("Computed in {ms} ms.", { ms: result.ms })}</div>
        {/* ---------- OVERLAY + ACCEPT ---------- */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <button type="button" onClick={() => surfA && surfB && onOverlay?.(surfA.id, surfB.id)} disabled={!surfA || !surfB} className="gs-btn" title={tr("Show both versions in the 3D view in contrasting colours (older grey-blue, newer orange) and hide the rest of the lineage.")}>
            <Layers size={12} />{" "}{tr("Overlay both in the 3D view")}</button>
          <button type="button" onClick={() => onClearOverlay?.()} className="gs-btn" title={tr("Put the compared surfaces back to their own colours.")}>{tr("Reset colours")}</button>
          {surfA && <button type="button" onClick={() => onAccept?.(surfA.id)} className="gs-btn" title={tr("Mark \"{name}\" as the accepted version of this lineage", { name: surfA.name })}><Check size={12} />{" "}{tr("Accept A")}</button>}
          {surfB && <button type="button" onClick={() => onAccept?.(surfB.id)} className="gs-btn" title={tr("Mark \"{name}\" as the accepted version of this lineage", { name: surfB.name })}><Check size={12} />{" "}{tr("Accept B")}</button>}
        </div>
      </div>
    </div>
  );
  const steps = [
    { key: "versions", label: tr("Versions"), render: () => versions, hint: same ? tr("Pick two different versions.") : "",
      primary: { label: busy ? tr("Comparing…") : tr("Compare geometry"), onClick: runCompare, disabled: !surfA || !surfB || same || busy } },
    { key: "result", label: tr("Result"), render: () => geometry || <div style={note}>{tr("Select two versions.")}</div>,
      primary: { label: <><Download size={12} />{" "}{tr("Export CSV")}</>, onClick: exportCsv, disabled: !surfA || !surfB } },
  ];
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={result ? step : 0} onAt={setStep} help={help} error={error} width="min(900px, 96vw)" />;
}

const { note, label, warn } = stepDialogStyles;
const good = { padding: "6px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-success-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", color: "var(--color-success-fg)" }; // success-bg is the dark-theme green (light text only)
const rowLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" };
const th = { textAlign: "start", padding: "5px 7px", background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 600 };
const td = { padding: "4px 7px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text)", whiteSpace: "nowrap" };
