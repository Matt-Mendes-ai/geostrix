import { surfaceOptionLabels } from "../lib/viewer/surfaceLabels.js"; // TASKS.csv #1192
import React, { useMemo, useState } from "react";
import { Download } from "./icons.js";
import { buildMeshQuery, isMeshClosed, signedDistanceToMesh, intervalsInsideMesh, holeDistanceToMesh } from "../lib/meshQuery.js";
import { saveFile } from "../lib/desktop.js";
import { toCsv, FORMULA_LEAD } from "../lib/tabular.js"; // TASKS.csv #1082
import { surfaceQueryRows } from "../lib/tableExports.js"; // TASKS.csv #1083
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { useStore } from "../lib/store.jsx"; // TASKS.csv #2626 — the shell's element and the assays (read only)
import { resolvedSegments } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js";
import { sampledByHole, sampledMetres } from "../lib/insideSampling.js"; // TASKS.csv #2626
import { pointFromInputs } from "../lib/pointInput.js"; // TASKS.csv #1743
import { buildVoxelLookup, sampleModelOnHoles, holesInBlockModel } from "../lib/voxelSample.js"; // TASKS.csv #2727
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926
import StepDialog, { stepDialogStyles } from "./StepDialog.jsx"; // TASKS.csv #4073
import { StepNumbers } from "./StepPane.jsx";

// TASKS.csv #146 — DISTANCE-TO-SURFACE / POINT-IN-DOMAIN QUERY AND REPORTING.
//
// Leapfrog-specialist audit finding: domain classification (#89) already existed INTERNALLY — it is
// what filterRowsByDomain/pointInDomain use to decide which control points feed an implicit surface —
// but a user could never ask it a question directly. There was no way to get "how far is this hole
// from surface X" or "how many metres of hole Y sit inside domain Z" out of the app, even though the
// geometry to answer both was already sitting in the scene. That is a QC gap first (a modelled shell
// that no hole actually intersects is usually a mistake, and you cannot see that by orbiting) and a
// reporting gap second (intercept metres per domain is the raw material of any
// resource-classification-style summary once #140's volumetrics exist).
//
// WHAT IT ANSWERS
//   * HOLES — every hole against one surface: closest approach (m) and the MD it occurs at, the
//     MDs where the hole pierces the surface, and, for a CLOSED surface, the downhole metres inside.
//   * POINT — one real-world XYZ against one surface: distance, and inside/outside with a sign.
//
// The geometry lives in src/lib/meshQuery.js, deliberately separate and dependency-free so it could be
// verified in Node against analytic ground truth (sphere/box) BEFORE any of this UI existed — see the
// TASKS.csv #146 notes for the numbers, including the two real bugs that verification caught.
//
// WATERTIGHTNESS IS NOT ASSUMED, IT IS CHECKED AND REPORTED. "Inside" is meaningless for an open
// surface — a draped stratigraphic contact, a fault plane, or a shell clipped against a modelling
// domain (runSurfaceStack drops triangles with vertices outside the domain, which punches holes in an
// otherwise-closed mesh). For those, this tool shows distance and pierce points and says plainly that
// metres-inside is not answerable, rather than printing a confident number from a parity test that has
// no defined answer. Same honesty principle as computeMeshVolume's openEdgeCount (#140).
//
// COORDINATES: meshes and hole traces are both taken in SCENE space, which this app keeps in real
// metres (see meshExport.js's header on why the scene<->world map is a rigid motion), so every distance
// printed here is already a real-world metre. Only the point-query input/output is converted to world
// coordinates, because that is what a user reads off a map.
// TASKS.csv #3016 (WA iron review) — inArea: the traces are the Model area's checked holes (Model settings); the sweep says so. It swept 6,390
// holes against a shell built from 228 (5.1 s to open).
// TASKS.csv #4073 — on the shared StepDialog: 1 Question (the surface, holes or a point, a block model: pre-filled, with the surface's closure as numbers),
// 2 Result (the totals as numbers, the table and Export CSV; or the point's distance). The explanations are in the Help card.
export default function SurfaceQueryModal({ surfaces = [], traces = [], sceneToWorld, worldToScene, inArea = false, onClose }) {
  const [surfaceId, setSurfaceId] = useState(() => surfaces[0]?.id || "");
  const [tab, setTab] = useState("holes");
  const [at, setAt] = useState(0); // the step
  // Closest-approach is swept at this spacing along the trace. It bounds ONLY that number's precision;
  // pierce depths and metres-inside are exact intersections and do not depend on it at all. Default 2 m
  // because performance is priority #1 here and a whole-project sweep is step-proportional: 0.5 m is
  // four times the work for a QC number nobody reads to the centimetre.
  const [step, setStep] = useState(2);
  const [ptX, setPtX] = useState("");
  const [ptY, setPtY] = useState("");
  const [ptZ, setPtZ] = useState("");

  const surface = surfaces.find((s) => s.id === surfaceId) || surfaces[0] || null;
  // TASKS.csv #2626 — a grade shell's own element (its stored params): the metres inside it, sampled for that element or not
  const { generatedSurfaces = [], assays = [], assayElements = [], voxelModels = [], collars = [], survey = [], desurveyMethod } = useStore();
  // TASKS.csv #2727 — block models too: the value at a point (and against a cutoff), and per hole the metres in the model and above a cutoff
  // TASKS.csv #3825 (#3792 (9)) — a grade estimate with a stepped (discrete) legend is still grades: it was left off the list (the Au and Ag estimates were not offered,
  // the IP models and a calculated model were). Only a model of units (its values are unit ids with names: valueLabels) is not a grade to query
  const blockModels = useMemo(() => (voxelModels || []).filter((m) => (m.cells || []).length && !(m.colorMode === "discrete" && m.valueLabels)), [voxelModels]);
  const [bmId, setBmId] = useState("");
  const [bmCut, setBmCut] = useState("");
  const bm = blockModels.find((m) => m.id === bmId) || null;
  const bmUnit = bm ? bm.params?.gradeUnit || bm.params?.unit || bm.unit || "" : "";
  const bmCutoff = bmCut !== "" && Number.isFinite(Number(bmCut)) ? Number(bmCut) : null;
  const bmLookup = useMemo(() => (bm ? buildVoxelLookup(bm.cells) : null), [bm]);
  const showing = at === 1; // the sweeps run on the Result step only
  const bmHoles = useMemo(() => (bm && showing && tab === "holes" ? sampleModelOnHoles({ model: bm, collars, survey, desurveyMethod }).rows : null), [bm, showing, tab, collars, survey, desurveyMethod]);
  const bmRows = useMemo(() => (bmHoles ? holesInBlockModel(bmHoles, bmCutoff) : []), [bmHoles, bmCutoff]);
  const bmPoint = useMemo(() => { if (!bmLookup || tab !== "point") return undefined; const p = pointFromInputs(ptX, ptY, ptZ); return p ? bmLookup.find(p.x, p.y, p.z) : undefined; }, [bmLookup, tab, ptX, ptY, ptZ]);
  const shellEl = useMemo(() => { const el = generatedSurfaces.find((g) => g.id === surface?.id)?.params?.element; return el && assayElements.some((e) => e.symbol === el) ? el : null; }, [generatedSurfaces, surface, assayElements]);
  const sampledHoles = useMemo(() => { if (!shellEl) return null; const units = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])); return sampledByHole(resolvedSegments(excludeQAQC(assays), shellEl, units[shellEl] || "ppm", units)); }, [shellEl, assays, assayElements]);

  // One BVH per surface, rebuilt only when the surface selection changes. Building over ~100k triangles
  // costs a few hundred ms; every query afterwards is a log-time tree descent, which is what makes the
  // whole-project sweep below finish instead of locking the UI.
  const mesh = useMemo(() => {
    if (!surface?.positions || !surface?.indices) return null;
    const q = buildMeshQuery(surface.positions, surface.indices);
    if (!q) return null;
    return { q, ...isMeshClosed(surface.positions, surface.indices) };
  }, [surface]);

  const rows = useMemo(() => {
    if (!mesh || tab !== "holes" || !showing) return [];
    return traces
      .filter((t) => t.pts && t.pts.length > 1)
      .map((t) => {
        const hd = holeDistanceToMesh(mesh.q, t.pts, { step });
        const iv = mesh.closed ? intervalsInsideMesh(mesh.q, t.pts) : null;
        // A TANGENTIAL TOUCH is a real thing on real data and needs saying, not hiding: a hole can
        // clip the surface exactly along a triangle edge, entering and leaving at the same depth. It
        // is a genuine pierce point but encloses no downhole metres, so without a label the row reads
        // as a contradiction ("1 pierce point, 0 m inside") and looks like a bug. Verified live on the
        // Harry property QSP halo: 17HR-270 @ 369.20 m and 17HR-285 @ 174.76 m both do exactly this
        // (closest approach 0.18 m, two bit-identical intersections), while 17HR-272 and 17HR-292 have
        // genuinely distinct entry/exit pairs 0.24 m and 0.20 m apart and are correctly NOT labelled.
        // Detected exactly, not guessed: intervalsInsideMesh merges same-classification neighbours, so
        // a crossing that is not an interval boundary did not change the hole's inside/outside state.
        const bounds = iv ? iv.intervals.map((x) => x.to) : [];
        const intercepts = (hd ? hd.intercepts : []).map((c) => ({
          ...c, tangential: iv ? !bounds.some((b) => Math.abs(b - c.md) < 1e-6) : false,
        }));
        return {
          hole_id: t.hole_id,
          minDistance: hd ? hd.minDistance : null,
          atMd: hd ? hd.atMd : null,
          intercepts,
          insideLength: iv ? iv.insideLength : null,
          insideIntervals: iv ? iv.intervals.filter((x) => x.inside) : [],
          sampledInside: iv && sampledHoles ? sampledMetres(iv.intervals.filter((x) => x.inside), sampledHoles.get(t.hole_id) || []) : null, // #2626
          totalLength: t.pts[t.pts.length - 1].md,
        };
      })
      .sort((a, b) => (a.minDistance ?? Infinity) - (b.minDistance ?? Infinity));
  }, [mesh, traces, step, tab, showing, sampledHoles]);

  const totals = useMemo(() => ({
    holes: rows.length,
    piercing: rows.filter((r) => r.intercepts.length > 0).length,
    inside: rows.reduce((s, r) => s + (r.insideLength || 0), 0),
    sampled: rows.reduce((s, r) => s + (r.sampledInside || 0), 0), // #2626
  }), [rows]);

  // POINT. Input is real-world easting/northing/elevation — the numbers on a collar sheet — and is
  // converted into scene space to be queried, so the user never has to know the internal frame exists.
  const pointResult = useMemo(() => {
    if (!mesh || tab !== "point") return null;
    const pt = pointFromInputs(ptX, ptY, ptZ); // #1743 — a blank box is a missing coordinate, not 0
    if (!pt) return null;
    const { x, y, z } = pt;
    const sp = worldToScene ? worldToScene({ x, y, z }) : { x, y, z };
    const r = signedDistanceToMesh(mesh.q, sp, mesh.closed);
    if (!r) return null;
    return { ...r, worldNearest: sceneToWorld ? sceneToWorld(r.point) : r.point };
  }, [mesh, tab, ptX, ptY, ptZ, worldToScene, sceneToWorld]);

  const exportCsv = () => {
    const lines = surfaceQueryRows(rows, { surfaceName: surface?.name, closed: !!mesh?.closed, sampledFor: mesh?.closed ? shellEl : null /* #2720 */ }); // #1083 — rows in lib, tested; TASKS.csv #1082 — written by Papa
    saveFile({
      suggestedName: `surface_query_${(surface?.name || "surface").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
      content: toCsv(lines, { escapeFormulae: FORMULA_LEAD }), encoding: "text",
    });
  };

  const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
  const heading = tr("Distance to surface / point-in-domain");
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-accent-dark)", marginBottom: 6, cursor: "pointer" }}>{tr("How it works")}</summary>
      <div style={note}><b>{tr("Holes")}</b> {tr("Closest approach is the true distance to the nearest face, edge or vertex, not just the nearest mesh vertex. Rows that cross the surface are highlighted and show 0. Hover an \"Inside\" cell for its intercepts.")}</div>
      <div style={note}><b>{tr("Point")}</b> {tr("The exact distance to the nearest point on the surface, negative inside a closed one.")}</div>
      <div style={note}><b>{tr("Closed")}</b> {tr("Only a closed surface has an inside. A draped contact or fault plane is open by nature; a shell that should be closed was probably clipped by a modelling domain or the grid boundary.")}</div>
      <div style={note}><b>{tr("Sweep step")}</b> {tr("Step of the closest-approach sweep along each trace. It limits only that number's precision: pierce depths and metres inside are exact intersections. Coarser is faster.")}</div>
    </details>
  );
  if (!surfaces.length) {
    return <StepDialog title={heading} onClose={onClose} help={help} width="min(560px, 96vw)" at={0} onAt={() => {}}
      steps={[{ key: "none", label: heading, render: () => <div style={note}>{tr("No generated surfaces yet: build one in 3D Modelling.")}</div>, primary: { label: tr("Close"), onClick: onClose } }]} />;
  }
  const closedRows = mesh ? [{ label: tr("Closed"), value: mesh.closed ? tr("yes") : tr("no ({openEdgeCount} open edges)", { openEdgeCount: mesh.boundaryEdges.toLocaleString() }), level: mesh.closed ? undefined : "some" }, { label: tr("Edges"), value: mesh.edges.toLocaleString() }] : [];
  const question = (
    <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={rowLabel}>{tr("Surface")}<select value={surface?.id || ""} onChange={(e) => setSurfaceId(e.target.value)} style={{ ...sel, minWidth: 260 }}>
          {surfaces.map((s) => <option key={s.id} value={s.id}>{surfaceOptionLabels(surfaces).get(s.id) ?? s.name}</option>)}
        </select>
      </label>
      {mesh ? <div style={{ maxWidth: 380 }}><StepNumbers rows={closedRows} /></div> : <div style={warn}>{tr("This surface's mesh is empty or degenerate — nothing to query.")}</div>}
      {mesh && !mesh.closed && <div style={note}>{tr("Open: no metres inside, only distances and pierce depths.")}</div>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={rowLabel}>{tr("Ask about")}</span>
        {[["holes", tr("Holes")], ["point", tr("Point")]].map(([k, label]) => <button data-btn-own="" type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)} style={chip(tab === k)}>{label}</button>)}
        {tab === "holes" && (
          <label style={{ ...rowLabel, flexDirection: "row", alignItems: "center", gap: 6, marginInlineStart: 8 }}>{tr("Sweep step")}<select value={step} onChange={(e) => setStep(Number(e.target.value))} style={sel}>
              {[0.5, 1, 2, 5].map((s) => <option key={s} value={s}>{s} m</option>)}
            </select>
          </label>
        )}
      </div>
      {blockModels.length > 0 && (<div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>{/* TASKS.csv #2727 */}
        <label style={rowLabel}>{tr("Block model")}<select value={bmId} onChange={(e) => setBmId(e.target.value)} style={{ ...sel, minWidth: 210 }} aria-label={tr("Block model to query")}>
          <option value="">{tr("— none —")}</option>
          {blockModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select></label>
        {bm && <label style={rowLabel}>{tr("Cutoff ({unit})", { unit: bmUnit || "—" })}<NumberInput allowEmpty value={bmCut} onChange={(v) => setBmCut(v == null ? "" : String(v))} placeholder={tr("none")} style={{ ...sel, width: 90 }} aria-label={tr("Cutoff of the block model")} /></label>}
      </div>)}
    </div>
  );
  const holesResult = mesh && (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ maxWidth: 380 }}><StepNumbers rows={[{ label: tr("Holes"), value: totals.holes.toLocaleString() }, { label: tr("Pierce the surface"), value: totals.piercing.toLocaleString(), level: totals.piercing === 0 && totals.holes > 0 ? "some" : undefined },
        mesh.closed && { label: tr("Inside"), value: `${totals.inside.toFixed(1)} m` }, mesh.closed && shellEl && totals.inside > 0 && { label: tr("Sampled for {el}", { el: shellEl }), value: `${totals.sampled.toFixed(1)} m`, level: totals.inside - totals.sampled > 0.5 * totals.inside ? "some" : undefined }]} /></div>
      <div style={note}>{inArea && <span>{" "}{tr("(the Model area's checked holes, Model settings)")}</span>}{/* #3016 */}
        {totals.piercing === 0 && totals.holes > 0 && <span style={{ color: "var(--color-warn-text)" }}>{" "}{tr("— no hole intersects this surface at all, which is usually worth a second look at the modelling inputs.")}</span>}
      </div>
      {mesh.closed && shellEl && totals.inside > 0 && ( /* TASKS.csv #2626 — the shell's metres with no sample of its element */
        <div role="note" style={{ ...note, color: totals.inside - totals.sampled > 0.5 * totals.inside ? "var(--color-warn-text)" : undefined }}>
          {tr("Of the {inside} m inside, {s} m are sampled for {el} and {u} m have no {el} sample: there the shell is the estimate's reach, not a measured grade.", { inside: totals.inside.toFixed(1), s: totals.sampled.toFixed(1), el: shellEl, u: Math.max(0, totals.inside - totals.sampled).toFixed(1) })}
        </div>
      )}
      <div style={{ maxHeight: "40vh", overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-sm)" }}>
          <thead>
            <tr>
              {[tr("Hole"), tr("Closest (m)"), tr("at MD (m)"), tr("Pierce points (MD)"), mesh.closed ? tr("Inside (m)") : tr("Inside"), ...(mesh.closed && shellEl ? [tr("Sampled for {el} (m)", { el: shellEl })] : []) /* #2626 */, tr("Hole length (m)")].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hole_id} style={{ background: r.intercepts.length ? "var(--color-selected-bg)" : "transparent" }}>
                <td style={{ ...td, fontWeight: 600 }}>{r.hole_id}</td>
                <td style={td}>{r.minDistance === 0 ? "0 (intersects)" : fmt(r.minDistance, 2)}</td>
                <td style={td}>{fmt(r.atMd, 1)}</td>
                <td style={{ ...td, color: "var(--color-text-secondary)" }} title={r.intercepts.some((i) => i.tangential) ? tr("A tangential intercept touches the surface and leaves at the same depth without entering it — a real contact point, but zero metres inside.") : ""}>
                  {r.intercepts.length ? r.intercepts.map((i) => `${i.md.toFixed(1)}${i.tangential ? " (tangential)" : ""}`).join(", ") : "—"}
                </td>
                <td style={td} title={r.insideIntervals.map((x) => `${x.from.toFixed(1)}–${x.to.toFixed(1)} m`).join(", ")}>
                  {r.insideLength == null ? "n/a" : r.insideLength > 0 ? r.insideLength.toFixed(2) : "0"}
                </td>
                {mesh.closed && shellEl && <td style={{ ...td, color: r.insideLength > 0 && (r.sampledInside || 0) < 0.5 * r.insideLength ? "var(--color-warn-text)" : undefined }}>{r.insideLength > 0 ? (r.sampledInside || 0).toFixed(2) : "—"}</td>}{/* #2626 */}
                <td style={{ ...td, color: "var(--color-text-muted)" }}>{fmt(r.totalLength, 1)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td style={td} colSpan={mesh.closed && shellEl ? 7 : 6}>{tr("No desurveyed holes — import collars and survey data first.")}</td></tr>}
          </tbody>
        </table>
      </div>
      {bm && (bmRows.length ? <div style={{ maxHeight: "28vh", overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-sm)" }}>
        <thead><tr>{[tr("Hole"), tr("In the model (m)"), ...(bmCutoff != null ? [tr("At or above {c} {unit} (m)", { c: bmCutoff, unit: bmUnit }), tr("Mean there ({unit})", { unit: bmUnit })] : [])].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{bmRows.map((r) => <tr key={r.hole_id}><td style={{ ...td, fontWeight: 600 }}>{r.hole_id}</td><td style={td}>{r.inM.toFixed(1)}</td>{bmCutoff != null && <><td style={td}>{r.aboveM.toFixed(1)}</td><td style={td}>{r.meanAbove == null ? "—" : +r.meanAbove.toPrecision(4)}</td></>}</tr>)}</tbody>
      </table></div> : <div style={note}>{tr("No drillhole passes through \"{name}\".", { name: bm.name })}</div>)}
    </div>
  );
  const pointPart = mesh && (
    <div style={{ flex: 1, display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 220 }}>
        <div style={note}>{tr("Real-world coordinates (same frame as your collars)")}</div>
        {[[tr("Easting (X)"), ptX, setPtX], [tr("Northing (Y)"), ptY, setPtY], [tr("Elevation (Z)"), ptZ, setPtZ]].map(([label, v, set]) => (
          <label key={label} style={rowLabel}>
            {label}
            <input value={v} onChange={(e) => set(e.target.value)} style={{ ...sel, fontFamily: "monospace" }} placeholder="0" />
          </label>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 6 }}>
        {!pointResult ? <div style={note}>{tr("Enter all three coordinates.")}</div> : (
          <>
            <div style={{ maxWidth: 380 }}><StepNumbers rows={[{ label: tr("Distance to surface"), value: `${pointResult.distance.toFixed(1)} m` },
              mesh.closed && { label: tr("Position"), value: pointResult.inside ? tr("inside") : tr("outside") },
              mesh.closed && { label: tr("Signed distance"), value: `${pointResult.signed.toFixed(1)} m`, title: tr("(negative = inside)") }]} /></div>
            {!mesh.closed && <div style={note}>{tr("Inside/outside is not defined for an open surface.")}</div>}
            <div style={note}>{tr("Nearest point on surface: {x}, {y}, {z}", { x: pointResult.worldNearest.x.toFixed(1), y: pointResult.worldNearest.y.toFixed(1), z: pointResult.worldNearest.z.toFixed(1) })}</div>
          </>
        )}
        {bm && <div style={{ fontSize: "var(--font-size-base)", lineHeight: 1.7 }}>{bmPoint === undefined ? null : !bmPoint ? tr("The point is outside every block of \"{name}\".", { name: bm.name }) : <>{tr("Block value at the point: {v} {unit}", { v: +Number(bmPoint.value).toPrecision(5), unit: bmUnit })}{bmCutoff != null ? " · " + (Number(bmPoint.value) >= bmCutoff ? tr("at or above the cutoff") : tr("below the cutoff")) : ""}{bmPoint.support ? " · " + tr("support: {s}", { s: bmPoint.support }) : ""}</>}</div>}
      </div>
    </div>
  );
  const steps = [
    { key: "question", label: tr("Question"), render: () => question, primary: { label: tab === "holes" ? tr("Sweep the holes") : tr("Next: the point"), disabled: !mesh } },
    { key: "result", label: tr("Result"), render: () => (tab === "holes" ? holesResult : pointPart),
      primary: tab === "holes" ? { label: <><Download size={12} />{" "}{tr("Export CSV")}</>, onClick: exportCsv, disabled: !rows.length } : { label: tr("Done"), onClick: onClose } },
  ];
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(860px, 96vw)" />;
}

const { note, warn } = stepDialogStyles;
const rowLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 3 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
const chip = (on) => ({ padding: "3px 12px", borderRadius: 12, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid " + (on ? "var(--color-selected-border)" : "var(--color-border-light)"), background: on ? "var(--color-selected-bg)" : "var(--color-bg)", color: on ? "var(--color-text)" : "var(--color-text-secondary)", fontWeight: on ? 600 : 400 });
const th = { textAlign: "start", padding: "6px 8px", background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 600 };
const td = { padding: "5px 8px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text)", whiteSpace: "nowrap" };
