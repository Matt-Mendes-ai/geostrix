// TASKS.csv #1879 — the Mine Design tab's STOPE OUTLINES: a block model at a cut-off seen level by level, nothing thinner than the
// minimum mining width, a dilution skin, each patch a stope outline and a solid with its diluted tonnes and grade. The underground
// counterpart of the pit shell for a high-grade body. Maths in lib/stopeOutlines.js. Outlines, not a stope optimizer: no
// geotechnical, access or sequencing check. Every number is the user's (#264).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Download, Layers3 } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { stopeRows } from "../lib/stopeOutlines.js";
import { elementOfModel, gradeWithElement } from "../lib/pitShell.js"; // TASKS.csv #2594
import { runStopeOutlinesAsync } from "../lib/stopeOutlinesClient.js"; // TASKS.csv #2279 — off the UI thread
import { gradeCandidate } from "../lib/gradeCandidate.js"; // #1848
import { categoricalModels } from "../lib/geologyForward.js";
import { valueUnit } from "../lib/blockModelExport.js";
import { sgSummary } from "../lib/gradeTonnage.js";
import { toExportCsv, crsCell } from "../lib/tabular.js";
import { saveFile } from "../lib/desktop.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import CollarLevelsNote from "./CollarLevelsNote.jsx"; // TASKS.csv #2584 — the lowest collar used where collars stand on benches
import { stopeRuns, stopeIdsOnLevel, stopeStringIds } from "../lib/stopeRuns.js"; // TASKS.csv #1968
import NotOfferedGrades from "./NotOfferedGrades.jsx"; // TASKS.csv #2436
import { stopeGroundSource, groundGrid, flatBodyCheck, drillLevels } from "../lib/stopeGround.js"; // TASKS.csv #2438; drillLevels: #2284
import { pitCeiling } from "../lib/pitCeiling.js"; // TASKS.csv #1964 (the lookup is built in the worker, #2279)

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text-strong)", marginTop: 4 };
const num = { ...smallSel, width: 84 };
const big = (v) => new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
const LEVEL_COLOURS = ["#e76f51", "#f4a261", "#e9c46a", "#2a9d8f", "#264653", "#8ab17d", "#bc6c25", "#6d597a"];
const EMPTY = { modelId: "", cutoff: "", levelH: "", zMin: "", zMax: "", minWidth: "", minLength: "", skin: "", density: "", dip: "", dipDir: "", pitId: "", pillar: "", crown: "" }; // crown: #2438 // dip / dipDir: #1953; pitId / pillar: #1964
let kept = null; // #1356 — the last result outlives the pane (this session)

// onAdd as the pit pane's (a solid into the generated surfaces); onRemove(id) takes one out again (#1887: a re-run replaces the
// stopes this pane put in the view)
// surfaces / meshOf (#1964): the generated surfaces (pit shells and designs to start below) and a surface's mesh in world E, N, Z
export default function StopesPane({ onAdd, onRemove, onClose, stopes = [], onShow = null, onRemoveMany = null, surfaces = [], meshOf = null }) { // stopes / onShow / onRemoveMany: TASKS.csv #1968
  const { voxelModels = [], layers, project, terrain, collars = [] /* #2438 */, setDesignStrings, designStrings = [], generatedSurfaces = [] } = useStore(); // generatedSurfaces: #1968 — the saved copy a Restore rebuilds from
  const models = useMemo(() => { const cat = new Set(categoricalModels(voxelModels)); return voxelModels.filter((m) => gradeCandidate(m, (x) => cat.has(x))); }, [voxelModels]);
  const [f, setF] = useState(() => ({ ...EMPTY, ...(kept?.inputs || {}), modelId: kept?.inputs?.modelId && models.some((m) => (m.id ?? m.name) === kept.inputs.modelId) ? kept.inputs.modelId : models[0]?.id ?? models[0]?.name ?? "" }));
  const [res, setRes] = useState(() => kept);
  const [msg, setMsg] = useState(null);
  const [added, setAdded] = useState({ solids: false, strings: false });
  const [busy, setBusy] = useState(null); // #2279 — null, or { level, levels } while the worker runs
  const job = useRef(null);
  useEffect(() => () => job.current?.cancel(), []); // a closed pane stops its run
  const model = models.find((m) => (m.id ?? m.name) === f.modelId) || null;
  const pits = useMemo(() => surfaces.filter((s) => s.type === "pit_shell" || s.type === "pit_design"), [surfaces]); // #1964
  const pit = pits.find((s) => s.id === f.pitId) || null;
  const unit = model ? valueUnit(model) || "" : "";
  const element = model ? elementOfModel(model) : null; // #2594 — 'Cut-off (% Li)', not 'Cut-off (%)'
  const sg = useMemo(() => sgSummary(layers?.sg), [layers?.sg]);
  const ground = useMemo(() => stopeGroundSource(terrain, collars), [terrain, collars]); // #2438 — the ground the pit tools use
  const levels = useMemo(() => (ground.underground ? drillLevels(collars) : null), [ground.underground, collars]); // #2284 — the mine's drill levels
  const zRange = useMemo(() => { if (!model) return null; let lo = Infinity, hi = -Infinity; for (const c of model.cells) { if (c.z - c.dz / 2 < lo) lo = c.z - c.dz / 2; if (c.z + c.dz / 2 > hi) hi = c.z + c.dz / 2; } return [lo, hi]; }, [model]);
  const blockH = model?.cells?.[0]?.dz; // #1886 — the level interval's placeholder and the slicing warning
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setMsg(null); };
  const v = (k) => (f[k] === "" ? null : Number(f[k]));
  const rangeBad = v("zMin") != null && v("zMax") != null && !(v("zMax") > v("zMin")); // #1893
  const dipTyped = v("dip") != null || v("dipDir") != null, dipBad = dipTyped && !(v("dip") > 0 && v("dip") < 90 && v("dipDir") != null && v("dipDir") >= 0 && v("dipDir") <= 360); // #1953 — both or neither
  const missing = !model || !(v("cutoff") >= 0) || !(v("levelH") > 0) || !(v("density") > 0) || rangeBad || dipBad;
  const run = async () => {
    if (missing || busy) return;
    // #2279 — a level interval under the block height, said BEFORE the run (it came after a 3 s run)
    if (blockH > 0 && v("levelH") < blockH - 1e-9 && !window.confirm(tr("Levels under {h} m are slices of the same block: the per-level figures repeat.", { h: blockH }) + " " + tr("Outline anyway?"))) return;
    const t0 = performance.now();
    // TASKS.csv #1964 — the pit as a ceiling sampled on the model's own columns over the pit's footprint
    let ceilingAt = null;
    if (pit) {
      const mesh = meshOf?.(pit.id);
      if (!mesh) { setMsg(tr("The pit's mesh is not in the view: show it and try again.")); return; }
      const P = mesh.positions, c0 = model.cells[0], dx = c0.dx, dy = c0.dy;
      let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
      for (let i = 0; i < P.length; i += 3) { if (P[i] < ax) ax = P[i]; if (P[i] > bx) bx = P[i]; if (P[i + 1] < ay) ay = P[i + 1]; if (P[i + 1] > by) by = P[i + 1]; }
      const x0 = c0.x + Math.floor((ax - c0.x) / dx) * dx, y0 = c0.y + Math.floor((ay - c0.y) / dy) * dy;
      const frame = { x0, y0, dx, dy, nx: Math.ceil((bx - x0) / dx) + 1, ny: Math.ceil((by - y0) / dy) + 1 };
      if (frame.nx * frame.ny > 4_000_000) { setMsg(tr("The model has too many columns ({n}) for this tool.", { n: frame.nx * frame.ny })); return; }
      ceilingAt = { values: pitCeiling(P, mesh.indices, frame), frame }; // #2279 — the grid goes to the worker, which builds the lookup
    }
    // TASKS.csv #2438 — no stope above the ground (less the crown): the ground sampled on the model's columns, for the worker
    const groundIn = ground.at ? groundGrid(model.cells, ground.at) : null;
    let r;
    setBusy({ level: 0, levels: 0 }); setMsg(null);
    try {
      job.current = runStopeOutlinesAsync(model, { cutoff: v("cutoff"), levelH: v("levelH"), zMin: v("zMin"), zMax: v("zMax"), minWidth: v("minWidth") || 0, minLength: v("minLength") || 0, skin: v("skin") || 0, density: v("density"), dipDeg: dipTyped ? v("dip") : null, dipDirDeg: dipTyped ? v("dipDir") : null /* #1953 */, pillar: pit ? v("pillar") || 0 : 0 /* #1964 */, crown: v("crown") || 0 /* #2438 */ }, ceilingAt, (level, levels) => setBusy({ level, levels }), groundIn);
      r = await job.current.promise;
    } catch (e) { kept = null; setRes(null); setMsg(tr("The outlines failed: {error}", { error: e?.message || String(e) })); return; } // #1884 — never a silent stale result
    finally { job.current = null; setBusy(null); }
    if (r?.cancelled) { setMsg(tr("Cancelled: nothing was outlined.")); return; }
    if (!r) { setMsg(tr("Nothing to outline: the model has no blocks with sizes.")); return; }
    if (r.failed === "range") { setMsg(tr("From RL must be below To RL.")); return; }
    if (r.failed) { setMsg(tr("The model has too many columns ({n}) for this tool.", { n: r.columns })); return; }
    const addedIds = kept?.addedIds || []; // #1887 — the stopes the earlier run put in the view go when a new run replaces them
    if (addedIds.length && onRemove) addedIds.forEach((id) => onRemove(id));
    const oldStrings = kept?.addedStringIds || []; // #1922 — and its outline strings
    if (oldStrings.length) { const gone = new Set(oldStrings); setDesignStrings((L) => L.filter((s) => !gone.has(s.id))); }
    kept = { ...r, inputs: { ...f }, model: model.name, pitName: pit ? String(pit.name) : null /* #1964 */, unit, element /* #2594 */, groundSource: groundIn ? ground.source : null /* #2438 */, seconds: Math.round((performance.now() - t0) / 100) / 10, addedIds: [], runId: `stoperun_${Date.now()}` }; // runId: #1968 — its solids and strings are managed together
    setRes(kept); setAdded({ solids: false, strings: false }); setMsg(null);
  };
  // #1885 — what the typed width and skin became on this model's columns
  const effWidthM = res ? res.widthCols * Math.min(...res.cell) : 0, effSkinM = res ? res.skinCols * Math.min(...res.cell) : 0;
  const addSolids = () => {
    let n = 0;
    const ids = [];
    res.levels.forEach((l, li) => l.stopes.forEach((s, si) => {
      if (!s.positions) return;
      n++;
      // #1885 — the tip and the params carry the width and skin as applied (whole columns), beside what was typed
      const id = onAdd?.({ name: tr("Stope {rl} m #{n}: {model} ≥ {c} {u}", { rl: Math.round(l.rl), n: si + 1, model: res.model, c: res.inputs.cutoff, u: res.unit }), positions: s.positions, indices: s.indices, volumeM3: s.volume, type: "stope", closure: "closed", color: LEVEL_COLOURS[li % LEVEL_COLOURS.length], tag: "stope",
        tip: tr("Stope outline: blocks at or above the cut-off, no thinner than {w} m ({n} column(s)), with a {k} m skin ({m} column(s)); not a mine design", { w: res.inputs.minWidth || 0, n: res.widthCols, k: res.inputs.skin || 0, m: res.skinCols }),
        params: { tool: "stope outlines by level (opening by the minimum width, a dilution skin)", runId: res.runId /* #1968 */, blockModel: res.model, gradeUnit: res.unit, cutoff: Number(res.inputs.cutoff), levelRL: l.rl, levelTop: l.top, minWidthM: Number(res.inputs.minWidth) || 0, minWidthAppliedM: effWidthM, minLengthM: Number(res.inputs.minLength) || 0, skinM: Number(res.inputs.skin) || 0, skinAppliedM: effSkinM, columnM: res.cell, density: Number(res.inputs.density),
          tonnes: Math.round(s.tonnes), grade: s.grade == null ? null : +s.grade.toPrecision(4), oreTonnes: Math.round(s.oreTonnes), oreGrade: s.oreGrade == null ? null : +s.oreGrade.toPrecision(4), columns: s.columns, dip: res.dip ? { dipDeg: res.dip.dipDeg, dipDirDeg: res.dip.dipDirDeg } : null /* #1953 */, holesFilled: s.holesFilled, belowPit: res.pit ? { pit: res.pitName, pillarM: res.pit.pillar } : null /* #1964 */,
          caution: "a stope outline from a block model: no geotechnical, access, sequencing or shape check; not a Mineral Reserve or Resource", generatedAt: new Date().toISOString() } });
      if (id) ids.push(id);
    }));
    if (kept === res) { kept = { ...res, addedIds: ids }; setRes(kept); } // #1887
    setAdded((a) => ({ ...a, solids: true })); setMsg(tr("{n} stope solid(s) added to the generated surfaces.", { n }));
  };
  const addStrings = () => {
    const strings = [];
    res.levels.forEach((l, li) => l.stopes.forEach((s, si) => strings.push({ id: `string_stope_${Date.now()}_${li}_${si}`, stopeRun: res.runId /* #1968 */, name: tr("Stope {rl} m #{n}", { rl: Math.round(l.rl), n: si + 1 }), color: LEVEL_COLOURS[li % LEVEL_COLOURS.length], visible: true, closed: true, vertices: s.outline.map((p) => p.map((x) => +x.toFixed(3))) })));
    setDesignStrings((L) => [...L, ...strings]);
    if (kept === res) { kept = { ...res, addedStringIds: strings.map((s) => s.id) }; setRes(kept); } // #1922
    setAdded((a) => ({ ...a, strings: true })); setMsg(tr("{n} outline(s) added as design strings (Strings tool).", { n: strings.length }));
  };
  const exportCsv = () => saveFile({ suggestedName: "stope_outlines.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(stopeRows(res, res.unit).map((r) => ({ ...r, block_model: res.model, element: res.element || "" /* #2594 */, cutoff: res.inputs.cutoff, crs: crsCell(project) }))) });
  const line = (label, val) => <div style={row}><span>{label}</span><b>{val}</b></div>;
  const field = (k, label, extra = {}) => <label style={row}>{label}<input type="number" min={0} step="any" value={f[k]} onChange={set(k)} style={num} {...extra} /></label>;
  const g = (x) => (x == null ? "—" : gradeWithElement(x, res.unit, res.element)); // #2594
  const flat = useMemo(() => (res ? flatBodyCheck(res.levels, Number(res.inputs?.levelH)) : null), [res]); // #2438

  return (
    <div>
      <TaskPaneHeader title="Stope outlines" icon={Layers3} tone="model" onClose={onClose} />
      <div style={note}>{tr("A block model at a cut-off, level by level: columns at or above the cut-off, nothing thinner than the minimum mining width, a dilution skin, and each patch left is a stope outline and a solid over the level, with its tonnes and diluted grade. Outlines, not a stope optimizer: no geotechnical, access or sequencing check.")}</div>
      {!models.length && <div style={warn}>{tr("It needs a block model of grades. Estimate one (3D Modelling > Estimation) or import one.")}</div>}
      <NotOfferedGrades voxelModels={voxelModels} />{/* TASKS.csv #2436 */}
      {models.length > 0 && (<>
        <label style={row}>{tr("Block model")}<select value={f.modelId} onChange={set("modelId")} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Block model of the stopes")}>{models.map((m) => <option key={m.id ?? m.name} value={m.id ?? m.name}>{m.name}</option>)}</select></label>
        {field("cutoff", unit ? tr("Cut-off ({unit})", { unit: element ? `${unit} ${element}` : unit }) : tr("Cut-off"))}
        {element && v("cutoff") > 0 && gradeWithElement(v("cutoff"), unit, element, (x) => String(Number(x.toPrecision(4)))).includes("(") && <div style={{ ...note, marginTop: 0 }}>{tr("Cut-off: {g}", { g: gradeWithElement(v("cutoff"), unit, element, (x) => String(Number(x.toPrecision(4)))) })}</div>}{/* #2594 — 0.4645 % Li (1 % Li2O) */}
        {field("levelH", tr("Level interval (m)"), { title: tr("The height of each stope: the distance between sublevels. A column counts as ore on a level only where its blocks fill at least half of it."), placeholder: blockH ? String(blockH) : "" })}
        {field("zMin", tr("From RL (m)"), { placeholder: zRange ? String(Math.round(zRange[0] * 10) / 10) : "" })}{/* the level a blank run starts at (the model's base): #1923, #1919 */}
        {levels && <div style={{ ...note, marginTop: 2 }}>{tr("The collars sit on {n} drill levels ({list} m), a median {s} m apart.", { n: levels.levels.length, list: levels.levels.slice(0, 6).map((v) => Math.round(v)).join(", ") + (levels.levels.length > 6 ? ", …" : ""), s: Math.round(levels.spacing) })} <button onClick={() => setF((p) => ({ ...p, zMin: String(Math.round(levels.from)), levelH: String(Math.round(levels.spacing)) }))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px" }}>{tr("Use the drill levels")}</button></div>}{/* TASKS.csv #2284 */}
        {field("zMax", tr("To RL (m)"), { placeholder: zRange ? String(Math.round(zRange[1])) : "" })}
        {field("minWidth", tr("Minimum mining width (m)"), { title: tr("Anything thinner is dropped (a morphological opening by this width, in whole columns of the model).") })}
        {field("minLength", tr("Minimum length (m)"), { title: tr("A patch shorter than this in both directions is dropped.") })}
        {field("skin", tr("Dilution skin (m)"), { title: tr("The outline grows by this all round; the added rock carries the model's grade there, or none.") })}
        {field("density", tr("Density (t/m³)"))}
        {/* TASKS.csv #1953 — a dipping vein: the stopes lean with it, the width and skin are measured across it */}
        {field("dip", tr("Dip of the body (°)"), { max: 89, placeholder: tr("vertical"), title: tr("Blank: vertical columns. With a dip, the blocks are taken along it, each stope leans with the body between its levels, and the width and skin are measured across the body.") })}{/* #2438 — not only a vein */}
        {field("dipDir", tr("Dip direction (°)"), { max: 360, placeholder: tr("—") })}
        {/* TASKS.csv #1964 — open pit then underground: stopes only under the pit's floor, column by column, with an optional crown pillar */}
        {pits.length > 0 && <label style={row}>{tr("Start below")}<select value={f.pitId} onChange={set("pitId")} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Pit the stopes start below")} title={tr("A pit shell or pit design: on each level a column is used only where the whole level lies under the pit's floor above it, so no stope sits in the volume the pit mines.")}><option value="">{tr("No pit (the whole model)")}</option>{pits.map((s) => <option key={s.id} value={s.id}>{String(s.name)}</option>)}</select></label>}
        {pit && field("pillar", tr("Pillar under the pit (m)"), { placeholder: "0", title: tr("Rock left between the pit floor and the highest stope. Blank: none.") })}
        {/* TASKS.csv #2438 — the ground the levels stop under, and an optional crown */}
        {ground.at && field("crown", tr("Crown under the ground (m)"), { placeholder: "0", title: tr("Rock left between the ground and the top of the highest stope. Blank: none; no stope reaches above the ground.") })}
        {!ground.at && <div style={note}>{ground.underground ? tr("The collars look like underground drill positions, so no ground is known: the levels are not checked against the surface. Load a terrain (Maps > Terrain).") : tr("No terrain or collar elevations: the levels are not checked against the ground.")}</div>}
        {ground.source === "collars" && <CollarLevelsNote collars={collars} />}
        {dipBad && <div style={warn}>{tr("A dip needs both the dip (0–90°) and the dip direction (0–360°).")}</div>}
        {sg && !f.density && <div style={{ ...note, marginTop: 2 }}><button onClick={() => setF((p) => ({ ...p, density: String(sg.mean) }))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px" }}>{tr("Use the logged mean, {v}", { v: sg.mean })}</button></div>}
        {model && <div style={note}>{tr("Columns of {dx} × {dy} m (the model's blocks); widths and skins round to whole columns.", { dx: model.cells[0]?.dx ?? "?", dy: model.cells[0]?.dy ?? "?" })}</div>}
        {rangeBad && <div style={warn}>{tr("From RL must be below To RL.")}</div>}
        {!busy
          ? <button onClick={run} disabled={missing} style={{ ...pBtn, marginTop: 8, opacity: missing ? 0.5 : 1 }}><Layers3 size={14} /> {tr("Outline the stopes")}</button>
          : <button onClick={() => job.current?.cancel()} style={{ ...pBtn, marginTop: 8 }}>{busy.levels ? tr("Outlining level {k} of {n}: cancel", { k: busy.level, n: busy.levels }) : tr("Outlining: cancel")}</button>}{/* #2279 */}
        {missing && !rangeBad && <div style={note}>{tr("Enter the cut-off, the level interval and the density: none has a default.")}</div>}
      </>)}
      {msg && <div style={warn}>{msg}</div>}
      {res && (
        <div style={{ marginTop: 8, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          {(() => { const withStopes = res.levels.filter((l) => l.stopes.length).length; return line(tr("Stopes"), withStopes === res.levels.length ? tr("{n} on {l} level(s)", { n: res.totals.stopes, l: withStopes }) : tr("{n} on {l} of {m} levels", { n: res.totals.stopes, l: withStopes, m: res.levels.length })); })()}{/* TASKS.csv #2283 — the levels that hold a stope, as 'Stopes in the project' counts them */}
          {line(tr("Tonnes (diluted)"), `${big(res.totals.tonnes)} t`)}
          {res.totals.unestimatedTonnes > 0.5 && <div style={note}>{tr("{t} t of it is rock the model has no block for (inside the outlines or their skin), counted at the density with no metal.", { t: big(res.totals.unestimatedTonnes) })}</div>}{/* TASKS.csv #2118 */}
          {line(tr("Grade (diluted)"), g(res.totals.grade))}
          {line(tr("Ore above cut-off"), `${big(res.totals.oreTonnes)} t`)}
          {line(tr("Grade above cut-off"), g(res.totals.oreGrade))}
          {res.totals.dilutionPct != null && line(tr("Dilution"), `${res.totals.dilutionPct.toFixed(0)} %`)}
          {line(tr("Outlined in"), `${res.seconds} s`)}
          {res.pit && <div style={note}>{tr("Below {pit}: {n} column-level(s) at the cut-off lie inside the pit or its {p} m pillar and were left out.", { pit: res.pitName, n: res.pit.shut, p: res.pit.pillar })}</div>}{/* #1964 */}
          {res.ground && res.ground.shut > 0 && <div style={note}>{tr("{n} column-level(s) at the cut-off reach above the ground less the {c} m crown ({src}) and were left out.", { n: res.ground.shut, c: res.ground.crown, src: res.groundSource === "terrain" ? tr("the terrain") : tr("interpolated between the collars") })}</div>}{/* #2438 */}
          {flat?.flat && <div style={warn}>{tr("A flat-lying body: the largest outline spans {a} × {b} m in plan on a {h} m level ({t} t). These are level outlines, not stopes; a flat body is a question for the pit tools or a method this tool does not design.", { a: Math.round(flat.a), b: Math.round(flat.b), h: +flat.h.toFixed(1), t: big(flat.tonnes) })}</div>}{/* #2438 */}
          {res.dip && <div style={note}>{tr("Along a dip of {d}° towards {a}°: each stope leans with the vein; the {w} m width and {s} m skin across it are {wg} m and {sg} m on the ground.", { d: res.dip.dipDeg, a: res.dip.dipDirDeg, w: res.inputs.minWidth || 0, s: res.inputs.skin || 0, wg: +res.dip.widthOnGroundM.toFixed(1), sg: +res.dip.skinOnGroundM.toFixed(1) })}</div>}{/* #1953 */}
          {/* #1885 — the width and skin as applied; #1886 — a level interval below the block height slices the same block */}
          <div style={note}>{tr("Width {w} m → {n} column(s) ({m} m); skin {s} m → {k} column(s) ({t} m).", { w: res.inputs.minWidth || 0, n: res.widthCols, m: +effWidthM.toFixed(1), s: res.inputs.skin || 0, k: res.skinCols, t: +effSkinM.toFixed(1) })}</div>
          {Number(res.inputs.skin) > 0 && res.skinCols === 0 && <div style={warn}>{tr("No dilution counted: the skin is under half a column.")}</div>}
          {res.blockH > 0 && Number(res.inputs.levelH) < res.blockH - 1e-9 && <div style={warn}>{tr("Levels under {h} m are slices of the same block: the per-level figures repeat.", { h: res.blockH })}</div>}
          {res.totals.stopes === 0 && res.pit && res.oreColumns > 0 && res.oreColumns === res.pit.shut ? <div style={warn}>{tr("Every column at the cut-off lies inside the pit or its pillar.")}</div> : res.totals.stopes === 0 && (res.oreColumns === 0
            ? <div style={warn}>{tr("No column reaches the cut-off on any level.")}</div>
            : <div style={warn}>{tr("Columns reach the cut-off, but no patch is {n} column(s) wide and {l} m long.", { n: res.widthCols, l: res.inputs.minLength || 0 })}</div>)}
          {res.unbuilt > 0 && <div style={warn}>{tr("{n} outline(s) could not be made into a solid (kept as outlines; the tonnes count).", { n: res.unbuilt })}</div>}
          <div style={{ marginTop: 6, maxHeight: 200, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 4 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-xs)" }}>
              <thead><tr style={{ position: "sticky", top: 0, background: "var(--color-bg)" }}>{[tr("Level"), tr("Stopes"), tr("t"), tr("Grade"), tr("Ore t")].map((h) => <th key={h} style={{ textAlign: "right", padding: "2px 4px", borderBottom: "1px solid var(--color-border)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{[...res.levels].reverse().map((l) => <tr key={l.rl}><td style={cellStyle}>{Math.round(l.rl)}</td><td style={cellStyle}>{l.stopes.length}</td><td style={cellStyle}>{l.tonnes ? big(l.tonnes) : "—"}</td><td style={cellStyle}>{l.grade == null ? "—" : Number(l.grade.toPrecision(3))}</td><td style={cellStyle}>{l.oreTonnes ? big(l.oreTonnes) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
          {res.levels.some((l) => l.stopes.some((s) => s.holesFilled)) && <div style={note}>{tr("Holes inside a patch were filled into the stope.")}</div>}
          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            <button onClick={addSolids} disabled={!res.totals.stopes || added.solids} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, opacity: !res.totals.stopes || added.solids ? 0.5 : 1 }}><Box size={13} /> {added.solids ? tr("Solids added") : tr("Stopes to the view")}</button>
            <button onClick={addStrings} disabled={!res.totals.stopes || added.strings} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0, opacity: !res.totals.stopes || added.strings ? 0.5 : 1 }}>{added.strings ? tr("Strings added") : tr("Outlines as strings")}</button>
            <button onClick={exportCsv} disabled={!res.totals.stopes} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }}><Download size={13} /> CSV</button>
          </div>
          <div style={{ ...note, marginTop: 4 }}>{tr("Conceptual, from your cut-off, width and skin on this block model. It is not a mine design, a Mineral Reserve or a Resource.")}</div>
        </div>
      )}
      <StopesInProject stopes={stopes} saved={generatedSurfaces} onAdd={onAdd} strings={designStrings} onShow={onShow} onRemoveMany={onRemoveMany} setDesignStrings={setDesignStrings} onRemoved={(ids) => { if (kept?.addedIds?.some((id) => ids.includes(id))) { kept = { ...kept, addedIds: kept.addedIds.filter((id) => !ids.includes(id)) }; setRes(kept); } }} />
    </div>
  );
}

// TASKS.csv #1968 — every stope solid in the project, by the run that made them: show / hide, remove all, a run or one level, with the
// outline strings the run sent to Strings. Generated surfaces are not in the project's undo (their meshes are too large to
// snapshot), so the last removal is kept from the saved copy and Restore rebuilds it (same run id: it regroups).
function StopesInProject({ stopes, saved = [], onAdd = null, strings, onShow, onRemoveMany, setDesignStrings, onRemoved }) {
  const runs = useMemo(() => stopeRuns(stopes), [stopes]);
  const [level, setLevel] = useState({});
  const [said, setSaid] = useState(null);
  const [last, setLast] = useState(null); // { surfaces: [saved copies], strings: [string objects] }
  const restore = () => {
    if (!last || !onAdd) return;
    for (const g of last.surfaces) {
      if (!g.vertices?.length || !g.indices?.length) continue;
      onAdd({ name: g.name, positions: Float64Array.from(g.vertices), indices: Uint32Array.from(g.indices), type: "stope", closure: g.closure || "closed", ...(g.color ? { color: g.color } : {}), tag: "stope", params: g.params || {} });
    }
    if (last.strings.length) setDesignStrings((L) => [...L, ...last.strings.filter((s) => !L.some((x) => x.id === s.id))]);
    setSaid(tr("Restored {n} stope solid(s).", { n: last.surfaces.length })); setLast(null);
  };
  if ((!runs.length && !last) || !onRemoveMany) return null;
  const total = stopes.length, allStrings = stopeStringIds(strings);
  const drop = (ids, stringIds, text) => {
    if (!window.confirm(text)) return;
    const idSet = new Set(ids), gone = new Set(stringIds);
    setLast({ surfaces: saved.filter((g) => idSet.has(g.id)), strings: strings.filter((s) => gone.has(s.id)) });
    onRemoveMany(ids); onRemoved?.(ids);
    if (stringIds.length) setDesignStrings((L) => L.filter((s) => !gone.has(s.id)));
    setSaid(tr(stringIds.length ? "Removed {n} stope solid(s) and {m} outline string(s). Restore brings them back (Ctrl+Z does not undo generated surfaces)." : "Removed {n} stope solid(s). Restore brings them back (Ctrl+Z does not undo generated surfaces).", { n: ids.length, m: stringIds.length }));
  };
  const andStrings = (m) => (m ? " " + tr("Its {m} outline string(s) in Strings go too.", { m }) : "");
  const shownAll = runs.every((r) => r.visible === r.count);
  return (
    <div style={{ marginTop: 10, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>{tr("Stopes in the project ({n})", { n: total })}</div>
      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
        {onShow && <button type="button" onClick={() => onShow(stopes.map((s) => s.id), !shownAll)} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }}>{shownAll ? tr("Hide all") : tr("Show all")}</button>}
        <button type="button" onClick={() => drop(stopes.map((s) => s.id), allStrings, tr("Remove all {n} stope solid(s) from the project?", { n: total }) + andStrings(allStrings.length))} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }}>{tr("Remove all stopes ({n})", { n: total })}</button>
      </div>
      {runs.map((r) => {
        const strs = stopeStringIds(strings, r.key), lv = level[r.key] ?? "";
        const label = tr("{model} ≥ {c}", { model: r.model || tr("(unnamed model)"), c: `${r.cutoff ?? "?"} ${r.unit}`.trim() });
        return (
          <div key={r.key} style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {onShow && <input type="checkbox" checked={r.visible > 0} onChange={(e) => onShow(r.ids, e.target.checked)} aria-label={tr("Show the stopes of {run}", { run: label })} />}
              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>{label}</span>
              <button type="button" onClick={() => drop(r.ids, strs, tr("Remove the {n} stope solid(s) of {run}?", { n: r.count, run: label }) + andStrings(strs.length))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px" }}>{tr("Remove")}</button>
            </div>
            <div style={{ ...note, marginTop: 2 }}>
              {tr("{n} stope(s) on {l} level(s), {t} t", { n: r.count, l: r.levels.length, t: big(r.tonnes) })}{r.when ? ` · ${r.when.slice(0, 10)}` : ""}{r.key.startsWith("earlier|") ? ` · ${tr("from an earlier session")}` : ""}
            </div>
            {r.levels.length > 1 && (
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 3 }}>
                <select value={lv} onChange={(e) => setLevel((p) => ({ ...p, [r.key]: e.target.value }))} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Level to remove")}>
                  <option value="">{tr("A level…")}</option>
                  {[...r.levels].reverse().map((rl) => <option key={rl} value={rl}>{tr("{rl} m", { rl })}</option>)}
                </select>
                <button type="button" disabled={lv === ""} onClick={() => { const ids = stopeIdsOnLevel(stopes, r.key, Number(lv)); drop(ids, [], tr("Remove the {n} stope solid(s) of {run} on the {rl} m level?", { n: ids.length, run: label, rl: lv })); setLevel((p) => ({ ...p, [r.key]: "" })); }} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px", opacity: lv === "" ? 0.5 : 1 }}>{tr("Remove level")}</button>
              </div>
            )}
          </div>
        );
      })}
      {allStrings.length > 0 && allStrings.length > runs.reduce((a, r) => a + stopeStringIds(strings, r.key).length, 0) && <div style={{ ...note, marginTop: 6 }}>{tr("Outline strings sent before runs were tagged are not removed with a run: Remove all stopes takes them, or remove them in Strings.")}</div>}
      {said && <div role="status" style={{ ...note, marginTop: 6 }}>{said}{last && onAdd && last.surfaces.length > 0 && <> <button type="button" onClick={restore} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px" }}>{tr("Restore")}</button></>}</div>}
    </div>
  );
}
const cellStyle = { textAlign: "right", padding: "2px 4px", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" };
