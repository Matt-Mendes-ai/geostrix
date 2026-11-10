// TASKS.csv #1874 — the Mine Design tab's BENCHED PIT DESIGN: a pit shell plus bench height, berm width and face angle give
// the pit a report shows: bench floors on round RLs, faces and catch benches up to the ground, crest / toe strings (DXF, CSV)
// and a bench-by-bench table. Geometry in lib/pitDesign.js, off the UI thread (pitDesignClient.js). Every number is the user's
// (#264): no bench, berm or face angle is assumed.
import React, { useMemo, useRef, useState } from "react";
import { metalAmountText, elementOfModel } from "../lib/pitShell.js"; // TASKS.csv #2434
import { Layers3, Eye, EyeOff, Trash2, Download } from "./icons.js";
import { confirmDestructive } from "../lib/confirmDestructive.js"; // #1498
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { runPitDesignAsync } from "../lib/pitDesignClient.js";
import { benchStringRows, benchStringFeatures, benchTableRows, predictDesignCell, benchHeightThatDraws, MAX_DESIGN_CELLS } from "../lib/pitDesign.js"; // predictDesignCell: #1916
import { buildDXF } from "../lib/dxf.js";
import { toExportCsv, crsCell } from "../lib/tabular.js";
import { saveFile } from "../lib/desktop.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import UndergroundOreNote from "./UndergroundOreNote.jsx"; // TASKS.csv #2277
import { t as tr } from "../lib/i18n.js";

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text-strong)", marginTop: 4 };
const num = { ...smallSel, width: 84 };
const big = (v) => new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
const EMPTY = { benchH: "", berm: "", batterDeg: "", datum: "", rampAz: "", rampTurn: "clockwise", rampGrade: "", rampW: "", sectors: {} }; // ramp*: #1948; sectors: #1952
const SECTOR_GRID = [["NW", "N", "NE"], ["W", null, "E"], ["SW", "S", "SE"]];
const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
let kept = null; // #1356 — the last result (with its strings, for export) outlives the pane this session

// surfaces: the project's generated surfaces (pit shells in, designs out); worldPositionsOf(id) -> Float64Array of E, N, Z for a
// surface's mesh; onAdd / onToggle / onRemove as the pit pane's
export default function PitDesignPane({ surfaces = [], worldPositionsOf, onAdd, onToggle, onRemove, onClose }) {
  const { voxelModels = [], terrain, collars = [], project, designStrings = [] } = useStore();
  const areas = useMemo(() => designStrings.filter((s) => s.closed && s.vertices.length > 2), [designStrings]); // #1916 — design areas
  const [areaId, setAreaId] = useState("");
  const area = areas.find((s) => s.id === areaId) || null;
  const pits = useMemo(() => surfaces.filter((s) => s.type === "pit_shell"), [surfaces]);
  const designs = useMemo(() => surfaces.filter((s) => s.type === "pit_design"), [surfaces]);
  const [pitId, setPitId] = useState(() => pits[pits.length - 1]?.id ?? "");
  const pit = pits.find((s) => s.id === pitId) || pits[pits.length - 1] || null;
  const [f, setF] = useState(() => ({ ...EMPTY, ...(kept?.inputs || {}) }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [res, setRes] = useState(() => (kept && surfaces.some((s) => s.id === kept.designId) ? kept : null));
  const [hideEarlier, setHideEarlier] = useState(true);
  const [largestOnly, setLargestOnly] = useState(true); // #1899 — a shell of several separate pits: design the largest alone
  const [showSectors, setShowSectors] = useState(() => Object.values(kept?.inputs?.sectors || {}).some((s) => s && (s.batterDeg || s.berm))); // #1952
  const setSector = (k, key, val) => { setF((p) => ({ ...p, sectors: { ...(p.sectors || {}), [k]: { ...(p.sectors?.[k] || {}), [key]: val } } })); setMsg(null); };
  // #1952 — the sectors typed, as numbers (blank: the overall); #1948 — the ramp, when all four of its numbers are typed
  const sectorsIn = (() => { const out = {}; SECTORS.forEach((k) => { const s = f.sectors?.[k] || {}, b = Number(s.batterDeg), w = Number(s.berm), o = {}; if (s.batterDeg !== "" && s.batterDeg != null && b > 0 && b < 90) o.batterDeg = b; if (s.berm !== "" && s.berm != null && w >= 0) o.berm = w; if (Object.keys(o).length) out[k] = o; }); return Object.keys(out).length ? out : null; })();
  const sectorBad = SECTORS.some((k) => { const s = f.sectors?.[k] || {}; return (s.batterDeg !== "" && s.batterDeg != null && !(Number(s.batterDeg) > 0 && Number(s.batterDeg) < 90)) || (s.berm !== "" && s.berm != null && !(Number(s.berm) >= 0)); });
  const rampTyped = [f.rampAz, f.rampGrade, f.rampW].some((x) => x !== "" && x != null);
  const rampIn = rampTyped && Number.isFinite(Number(f.rampAz)) && f.rampAz !== "" && Number(f.rampGrade) > 0 && Number(f.rampW) > 0 ? { azimuthDeg: Number(f.rampAz), turn: f.rampTurn === "anticlockwise" ? "anticlockwise" : "clockwise", gradientPct: Number(f.rampGrade), widthM: Number(f.rampW) } : null;
  const rampBad = rampTyped && !rampIn;
  const pitCount = Number(pit?.params?.pitCount) || 1;
  const job = useRef(null);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setMsg(null); };
  const v = (k) => Number(f[k]);
  const missing = !pit || !(v("benchH") > 0) || !(v("berm") >= 0) || f.berm === "" || !(v("batterDeg") > 0 && v("batterDeg") < 90) || sectorBad || rampBad; // sectorBad: #1952; rampBad: #1948
  const reach = !missing ? v("benchH") / Math.tan((v("batterDeg") * Math.PI) / 180) + v("berm") : null;
  const interRamp = reach != null ? (Math.atan(v("benchH") / reach) * 180) / Math.PI : null;
  const shellSlope = Number(pit?.params?.inputs?.slopeDeg);
  // #1916 — the cell the design grid will get, before the run: from the shell's box (or the area's), its depth and its cell
  const shellBox = useMemo(() => {
    const p = pit && worldPositionsOf?.(pit.id); if (!p) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; if (p[i + 2] < z0) z0 = p[i + 2]; if (p[i + 2] > z1) z1 = p[i + 2]; }
    return Number.isFinite(x0) ? { w: x1 - x0, h: y1 - y0, zRange: z1 - z0 } : null; // zRange: #2278 — crest to floor, as the run counts benches
  }, [pit, worldPositionsOf]);
  const areaBox = useMemo(() => { if (!area) return null; const xs = area.vertices.map((q) => q[0]), ys = area.vertices.map((q) => q[1]); return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }, [area]);
  const largestBox = !area && pitCount > 1 && largestOnly && Array.isArray(pit?.params?.largestPitBoxM) ? { w: pit.params.largestPitBoxM[0], h: pit.params.largestPitBoxM[1] } : null; // #1926
  const predictArgs = (shellBox || areaBox) && pit ? { boxW: Math.min(areaBox?.w ?? Infinity, largestBox?.w ?? shellBox?.w ?? Infinity), boxH: Math.min(areaBox?.h ?? Infinity, largestBox?.h ?? shellBox?.h ?? Infinity), /* the run's box is the kept columns': within both */ depth: Math.max(Number(pit.params?.maxDepthM) || 0, shellBox?.zRange || 0), shellCell: Number(pit.params?.gridCellM?.[0]) || 10, berm: v("berm"), batterDeg: v("batterDeg"), sectors: sectorsIn, ramp: rampIn, maxCells: MAX_DESIGN_CELLS } : null; // depth, sectors, ramp: #2278
  const predicted = !missing && predictArgs ? predictDesignCell({ ...predictArgs, benchH: v("benchH") }) : null;
  const drawsAt = predicted && !predicted.facesDrawn ? benchHeightThatDraws(predictArgs) : null;
  // the block model the shell was run on: its blocks above the shell's cut-off are the design's ore
  const model = useMemo(() => (pit ? voxelModels.find((m) => (m.id ?? m.name) === pit.params?.inputs?.modelId) || voxelModels.find((m) => m.name === pit.params?.blockModel) || null : null), [pit, voxelModels]);
  const unit = pit?.params?.gradeUnit || "";
  // TASKS.csv #1917 — a shell priced with a by-product: its blocks are ore on both metals' revenue, so the by-product model goes too
  const byIn = pit?.params?.inputs?.by || null;
  const byModel = useMemo(() => (byIn ? voxelModels.find((m) => (m.id ?? m.name) === byIn.modelId) || voxelModels.find((m) => m.name === pit?.params?.byProduct?.blockModel) || null : null), [byIn, pit, voxelModels]);

  const run = async () => {
    const positions = worldPositionsOf?.(pit.id);
    if (!positions) { setMsg(tr("The pit's mesh is not in the view: show it and try again.")); return; }
    const inputs = { benchH: v("benchH"), berm: v("berm"), batterDeg: v("batterDeg"), datum: f.datum === "" ? 0 : Number(f.datum) || 0, ...(sectorsIn ? { sectors: sectorsIn } : {}), ...(rampIn ? { ramp: rampIn } : {}) }; // sectors: #1952; ramp: #1948
    const opts = { ...inputs, cutoff: Number(pit.params?.cutoffGrade) || Infinity, density: Number(pit.params?.inputs?.density) || 1, largestOnly: pitCount > 1 && largestOnly && !area, areaPoly: area ? area.vertices.map((q) => [q[0], q[1]]) : null, economics: byIn && byModel ? { ...pit.params.inputs, unit: unit || pit.params.inputs.unit } : null /* #1917 */ }; // areaPoly: #1916
    setBusy(true); setMsg(null);
    const t0 = performance.now();
    try {
      job.current = runPitDesignAsync(positions, model, opts, terrain, collars, null, byIn ? byModel : null); // byModel: #1917
      const r = await job.current.promise;
      if (r.cancelled) { setMsg(tr("Cancelled: nothing was added.")); return; }
      if (r.failed === "area-empty") { setMsg(tr("No column of the shell lies inside \"{name}\": move or enlarge the area, or pick another.", { name: area?.name || "?" })); return; } // #1916
      if (r.failed === "underground") { setMsg(tr("The collars look like underground drill positions ({upward} hole(s) drilled upward, {stacked} pair(s) of collars stacked over each other): no ground surface is known, so no pit is cut from them. Load a terrain (Maps > Terrain) for the real surface.", { upward: r.underground?.upward ?? 0, stacked: r.underground?.stacked ?? 0 })); return; } // #2276
      if (r.failed) { setMsg(tr("The design failed: {v}", { v: r.failed })); return; }
      if (!r.benches.length) { setMsg(tr("No bench fits: the shell is shallower than one bench height.")); return; }
      if (r.benches.length === 1 && !r.daylights && r.faceRun < r.cell) { setMsg(tr("One bench only: a face run of {r} m is narrower than the {c} m design grid, so the walls could not be drawn. Use a flatter face, a taller bench or a berm.", { r: r.faceRun.toFixed(2), c: r.cell.toFixed(1) })); return; } // #1902
      const seconds = Math.round((performance.now() - t0) / 100) / 10;
      if (hideEarlier) designs.filter((s) => s.visible).forEach((s) => onToggle?.(s.id));
      const name = tr("Pit design: {pit}, {h} m benches, {b} m berms, {a}°{sec}{ramp}", { pit: String(pit.name).replace(/^Pit shell: /, ""), h: inputs.benchH, b: inputs.berm, a: inputs.batterDeg, sec: sectorsIn ? tr(" (by sector)") : "", ramp: rampIn ? tr(", {w} m ramp at {g} %", { w: rampIn.widthM, g: rampIn.gradientPct }) : "" }); // sec: #1952; ramp: #1948
      const designId = onAdd({
        name, positions: r.positions, indices: r.indices, type: "pit_design", closure: null, color: "#d9a441", tag: "pitdesign",
        tip: tr("Benched pit design: benches, berms and faces on a conceptual shell; not a mine plan, a Reserve or a Resource"),
        params: { tool: "benched pit design (bottom-up dilation on a grid)", pit: pit.name, pitId: pit.id, blockModel: model?.name || null, gradeUnit: unit, inputs, interRampDeg: +r.interRampDeg.toFixed(1), shellSlopeDeg: Number.isFinite(shellSlope) ? shellSlope : null,
          benches: benchTableRows(r.benches, unit), floorRL: r.floorRL, crestRL: r.crestRL, oreTonnes: Math.round(r.totals.oreT), wasteTonnes: Math.round(r.totals.wasteT), stripRatio: r.totals.stripRatio == null ? null : +r.totals.stripRatio.toFixed(2),
          meanGrade: r.totals.meanGrade == null ? null : +r.totals.meanGrade.toPrecision(4), designCellM: +r.cell.toFixed(2), coarsened: r.coarsened, groundFrom: r.groundSource, strings: r.strings.length,
          sectorsUsed: r.sectorsUsed || null /* #1952 */, ramp: r.ramp ? { ...r.ramp, rockT: Math.round(r.ramp.rockT) } : null /* #1948 */,
          caution: "geometric design on a conceptual shell (with the ramp and the sector slopes as entered): no dilution or scheduling; not a Mineral Reserve or Resource", generatedAt: new Date().toISOString() }, // TASKS.csv #1971: the ramp and sectors exist; the always-null metalFactor removed
      });
      kept = { ...r, inputs, seconds, designId, pitName: pit.name, unit, shell: pit.params || {}, modelMissing: !model, areaName: area?.name || null };
      setRes(kept);
    } catch (e) {
      setMsg(e.message === "no-floors" ? tr("No mined column was found under the ground: the shell may sit above the terrain loaded now.")
        : e.message === "area-empty" ? tr("No column of the shell lies inside \"{name}\": move or enlarge the area, or pick another.", { name: area?.name || "?" }) // #1928
        : tr("The design failed: {v}", { v: e.message || e }));
    } finally { setBusy(false); job.current = null; }
  };
  const cancel = () => job.current?.cancel();
  const removeDesign = (s) => {
    if (!confirmDestructive(tr("Remove the design \"{name}\"?", { name: s.name }), { recover: tr("run it again with the same inputs.") })) return;
    onRemove?.(s.id);
    if (res?.designId === s.id) { setRes(null); kept = null; }
  };
  const exportStringsDxf = () => saveFile({ suggestedName: "pit_design_strings.dxf", filters: [{ name: "DXF", extensions: ["dxf"] }], content: buildDXF({ features: benchStringFeatures(res.strings), geomType: "line", layerOf: (ft) => ft.attributes.name, colorOf: (ft) => (ft.attributes.kind === "crest" ? "#b22222" : "#1f6fb2") }) });
  const exportStringsCsv = () => saveFile({ suggestedName: "pit_design_strings.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(benchStringRows(res.strings).map((r) => ({ ...r, crs: crsCell(project) }))) });
  const exportBenchesCsv = () => saveFile({ suggestedName: "pit_design_benches.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(benchTableRows(res.benches, res.unit).map((r) => ({ ...r, pit: res.pitName, crs: crsCell(project) }))) });
  // #1929 — the figures in brackets: the whole shell's, or the largest separate pit's when that alone was designed
  const cmp = res?.partsDropped > 0 && res.shell?.largestPit ? res.shell.largestPit : (res?.shell || {});
  const cmpLabel = (whole, part) => (res?.partsDropped > 0 && res.shell?.largestPit ? part : whole);
  const line = (label, val) => <div style={row}><span>{label}</span><b>{val}</b></div>;
  const field = (k, label, extra = {}) => <label style={row}>{label}<input type="number" min={0} step="any" value={f[k]} onChange={set(k)} style={num} {...extra} /></label>;
  const metalText = (r) => { // the shell's contained metal is in its own unit; the design's is scaled from the same grade basis
    const sh = r.shell, shOre = Number(sh.oreTonnes), shMetal = Number(sh.containedMetal), shGrade = Number(sh.meanGrade);
    if (!(shOre > 0 && shMetal > 0 && shGrade > 0) || r.totals.meanGrade == null) return null;
    const perUnit = shMetal / (shOre * shGrade), m = r.totals.oreT * r.totals.meanGrade * perUnit;
    return metalAmountText(m, sh.containedMetalUnit, elementOfModel({ params: { element: sh.element }, name: sh.blockModel }), big); // #2434 — the Pit shell's words
  };
  const gradeText = (g) => (g == null ? "—" : `${Number(g.toPrecision(3))} ${unit}`);

  return (
    <div>
      <TaskPaneHeader title="Pit design" icon={Layers3} tone="model" onClose={onClose} />
      <div style={note}>{tr("Benches, berms and faces on a pit shell: bench floors on round elevations, a face at the batter angle up to each crest and a catch bench before the next, from the pit bottom to where the walls meet the ground. It gives crest and toe strings and a bench-by-bench table. A ramp, and a face angle and berm per wall sector, can be added; there is no dilution or scheduling, so it is a drawing of the shell, not a mine plan.")}</div>
      {!pits.length && <div style={warn}>{tr("It needs a pit shell: run Pit shell first.")}</div>}
      {pits.length > 0 && (<>
        <label style={row}>{tr("Pit shell")}<select value={pit?.id || ""} onChange={(e) => setPitId(e.target.value)} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Pit shell to design on")}>
          {pits.map((s) => <option key={s.id} value={s.id}>{String(s.name).replace(/^Pit shell: /, "")}</option>)}
        </select></label>
        {field("benchH", tr("Bench height (m)"))}
        {field("berm", tr("Berm width (m)"), { title: tr("The catch bench left between one face's crest and the next face's toe.") })}
        {field("batterDeg", tr("Face angle (°)"), { max: 89, title: tr("The angle of each bench face (batter), steeper than the overall slope.") })}
        {field("datum", tr("Bench datum (m)"), { placeholder: "0", title: tr("Bench floors sit at this elevation plus whole bench heights. Blank: multiples of the bench height.") })}
        {/* TASKS.csv #1952 — a face angle and a berm width per wall sector: blank takes the overall */}
        <div style={{ ...note, marginTop: 2 }}><button onClick={() => setShowSectors((s) => !s)} style={linkBtn} aria-expanded={showSectors}>{showSectors ? tr("Hide the face and berm by wall sector") : tr("Face and berm by wall sector…")}</button></div>
        {showSectors && (
          <div style={{ marginTop: 4 }}>
            <div style={note}>{tr("The wall on each side of the pit: face angle (°) and berm width (m). Blank takes the overall. From the geotechnical domains, not a guess.")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, marginTop: 4 }}>
              {SECTOR_GRID.flat().map((k, i) => (k
                ? <div key={k} style={{ ...note, display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}><span style={{ width: 20, textAlign: "right", flexShrink: 0 }}>{k}</span>
                    <input type="number" min={1} max={89} step="any" value={f.sectors?.[k]?.batterDeg ?? ""} onChange={(e) => setSector(k, "batterDeg", e.target.value)} placeholder={f.batterDeg || "°"} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Face angle of the {k} wall", { k })} />
                    <input type="number" min={0} step="any" value={f.sectors?.[k]?.berm ?? ""} onChange={(e) => setSector(k, "berm", e.target.value)} placeholder={f.berm || "m"} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Berm width of the {k} wall", { k })} /></div>
                : <span key={`c${i}`} style={{ ...note, textAlign: "center", alignSelf: "center" }}>{tr("° / m")}</span>))}
            </div>
            {sectorBad && <div style={warn}>{tr("A sector's face angle must be between 0 and 90°, its berm 0 or more.")}</div>}
          </div>
        )}
        {/* TASKS.csv #1948 — a ramp: where the road reaches the floor, which way it turns, its gradient and width */}
        <div style={{ ...label, marginTop: 8 }}>{tr("Ramp (optional)")}</div>
        <div style={note}>{tr("A haul road spiralling up the wall from the pit floor: the bearing from the pit's centre where it reaches the floor, the way it turns climbing, its gradient and width. Each bench's berm is widened by the road, so the design's waste includes it. One spiral: where a wall is too short for the run, the ramp stops and says a switchback is needed.")}</div>
        {field("rampAz", tr("Reaches the floor at (° from the pit centre)"), { min: 0, max: 360, placeholder: tr("none") })}
        <label style={row}>{tr("Turns, climbing")}<select value={f.rampTurn || "clockwise"} onChange={set("rampTurn")} style={{ ...smallSel, width: 120 }} aria-label={tr("Ramp turn")}><option value="clockwise">{tr("clockwise")}</option><option value="anticlockwise">{tr("anticlockwise")}</option></select></label>
        {field("rampGrade", tr("Gradient (%)"), { placeholder: tr("none") })}
        {field("rampW", tr("Road width (m)"), { placeholder: tr("none") })}
        {rampBad && <div style={warn}>{tr("A ramp needs its floor bearing, a gradient above 0 and a width above 0.")}</div>}
        {/* TASKS.csv #1916 — a design area: a closed design string; the design grid then covers that part of the shell alone */}
        {areas.length > 0 && <label style={row}>{tr("Design area")}<select value={areaId} onChange={(e) => { setAreaId(e.target.value); setMsg(null); }} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Design area (a closed design string)")} title={tr("Only the shell's columns inside this closed string are designed, so the design grid goes to one prospect.")}><option value="">{tr("— the whole shell —")}</option>{areas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
        {predicted && (predicted.facesDrawn
          ? <div style={note}>{tr("Design cell at these benches: {c} m; the {f} m faces are drawn.", { c: predicted.cell.toFixed(1), f: predicted.faceRun.toFixed(1) })}</div>
          : <div style={warn}>{tr("Design cell at these benches: {c} m, wider than the {f} m face: no faces or berms would be drawn, only the shell stepped to bench floors.", { c: predicted.cell.toFixed(1), f: predicted.faceRun.toFixed(1) })} {drawsAt ? tr("Benches of {h} m would draw at this size; or pick a design area (a closed design string) so the grid covers one prospect.", { h: drawsAt }) : tr("Pick a design area (a closed design string) so the grid covers one prospect.")}</div>)}
        {interRamp != null && (
          <div style={{ ...note, marginTop: 4 }}>
            {tr("Inter-ramp angle at these benches: {a}° (a face run of {r} m plus the berm).", { a: interRamp.toFixed(1), r: (reach - v("berm")).toFixed(1) })}
            {Number.isFinite(shellSlope) && Math.abs(interRamp - shellSlope) > 1 && <div style={warn}>{interRamp < shellSlope
              ? tr("Flatter than the {s}° the shell was solved at: the design will take more waste than the shell counted.", { s: shellSlope })
              : tr("Steeper than the {s}° the shell was solved at: the design stands inside the shell's walls, which the shell's economics did not test.", { s: shellSlope })}</div>}
          </div>
        )}
        {pit && !model && <div style={warn}>{tr("The block model the shell was run on (\"{m}\") is not in the project any more: the table will show rock only, no ore.", { m: pit.params?.blockModel || "?" })}</div>}
        {pit && model && byIn && !byModel && <div style={warn}>{tr("The by-product model the shell was run with (\"{m}\") is not in the project any more: the ore is decided on the main metal alone, at its cut-off.", { m: pit.params?.byProduct?.blockModel || "?" })}</div>}{/* #1917 */}
        {pitCount > 1 && !area && <label style={{ ...row, justifyContent: "flex-start" }} title={tr("The shell is several separate pits; the design grid then goes to the largest alone.")}><input type="checkbox" checked={largestOnly} onChange={(e) => setLargestOnly(e.target.checked)} />{tr("Design the largest of the {n} separate pits only", { n: pitCount })}</label>}{/* #1899 */}
        {designs.some((s) => s.visible) && <label style={{ ...row, justifyContent: "flex-start" }}><input type="checkbox" checked={hideEarlier} onChange={(e) => setHideEarlier(e.target.checked)} />{tr("Hide the earlier designs")}</label>}
        {!busy
          ? <button onClick={run} disabled={missing} style={{ ...pBtn, marginTop: 8, opacity: missing ? 0.5 : 1 }}><Layers3 size={14} /> {tr("Design the benches")}</button>
          : <button onClick={cancel} style={{ ...pBtn, marginTop: 8 }}>{tr("Designing: cancel")}</button>}
        {missing && !busy && <div style={note}>{tr("Enter the bench height, berm width and face angle: none has a default, because they are the design.")}</div>}
      </>)}
      {designs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...row, marginTop: 0, fontWeight: 600, color: "var(--color-text)" }}>{tr("Designs ({n})", { n: designs.length })}</div>
          {designs.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, padding: "4px 6px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg-subtle)", fontSize: "var(--font-size-sm)" }}>
              <button onClick={() => onToggle?.(s.id)} style={iconBtnStyle} aria-label={s.visible ? tr("Hide {name}", { name: s.name }) : tr("Show {name}", { name: s.name })} title={s.visible ? tr("Hide") : tr("Show")}>{s.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
              <span title={s.name} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: s.visible ? "var(--color-text)" : "var(--color-text-muted)" }}>{String(s.name).replace(/^Pit design: /, "")}</span>
              {Number.isFinite(s.params?.oreTonnes) && <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{`${big(s.params.oreTonnes)} t`}</span>}
              <button onClick={() => removeDesign(s)} style={iconBtnStyle} aria-label={tr("Remove {name}", { name: s.name })} title={tr("Remove")}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      {pit && <UndergroundOreNote model={model} cutoff={pit.params?.cutoffGrade} />}{/* #2277 */}
      {msg && <div style={warn}>{msg}</div>}
      {res && (
        <div style={{ marginTop: 8, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          {line(tr("Benches"), tr("{n} ({lo} to {hi} m)", { n: res.benches.length, lo: Math.round(res.floorRL), hi: Math.round(res.crestRL) }))}
          {line(tr("Inter-ramp angle"), `${res.interRampDeg.toFixed(1)}°`)}
          {res.sectorsUsed && <div style={note}>{tr("By wall (face° / berm m): {list}.", { list: Object.entries(res.sectorsUsed).map(([k, s]) => `${k} ${s.batterDeg}° / ${s.berm}`).join(", ") })}</div>}{/* #1952 */}
          {res.ramp && line(tr("Ramp"), tr("{L} m at {g} %, {w} m wide, over {n} bench(es)", { L: Math.round(res.ramp.lengthM).toLocaleString(), g: res.ramp.gradientPct, w: res.ramp.widthM, n: res.ramp.benches }))}{/* #1948 */}
          {res.ramp && line(tr("Rock under the road"), `${big(res.ramp.rockT)} t`)}
          {res.ramp?.needsSwitchback && <div style={warn}>{tr("The wall at {rl} m is too short for a {g} % run at this width: the ramp stops there and a switchback is needed, which is not drawn.", { rl: Math.round(res.ramp.stoppedAtRL), g: res.ramp.gradientPct })}</div>}
          {res.ramp && !res.ramp.needsSwitchback && res.ramp.benches < res.benches.length && <div style={note}>{tr("The ramp climbs {n} of the {m} benches: the benches above it have no road.", { n: res.ramp.benches, m: res.benches.length })}</div>}
          {/* #1929 — when the largest part alone was designed, the comparison is that part's, not the whole shell's */}
          {line(cmpLabel(tr("Ore (shell)"), tr("Ore (largest pit)")), `${big(res.totals.oreT)} t (${big(Number(cmp.oreTonnes) || 0)} t)`)}
          {line(cmpLabel(tr("Mean grade (shell)"), tr("Mean grade (largest pit)")), `${gradeText(res.totals.meanGrade)} (${gradeText(Number(cmp.meanGrade) || null)})`)}
          {metalText(res) && line(tr("Contained metal"), metalText(res))}
          {line(cmpLabel(tr("Waste (shell)"), tr("Waste (largest pit)")), `${big(res.totals.wasteT)} t (${big(Number(cmp.wasteTonnes) || 0)} t)`)}
          {line(cmpLabel(tr("Strip ratio (shell)"), tr("Strip ratio (largest pit)")), `${res.totals.stripRatio == null ? "—" : res.totals.stripRatio.toFixed(2)} (${Number.isFinite(Number(cmp.stripRatio)) ? Number(cmp.stripRatio).toFixed(2) : "—"})`)}
          {line(tr("Design cell"), `${res.cell.toFixed(1)} m`)}
          {line(tr("Designed in"), `${res.seconds} s`)}
          {res.modelMissing && <div style={warn}>{tr("No block model: the ore column is empty, the rock is counted.")}</div>}
          {res.coarsened && <div style={warn}>{tr("The design grid was made coarser to stay within the limit: faces and strings are coarser than asked.")}</div>}
          {res.columnsInArea > 0 && <div style={note}>{tr("Designed inside \"{name}\": {n} of the shell's columns.", { name: res.areaName || "?", n: res.columnsInArea })}</div>}{/* #1916 */}
          {res.partsDropped > 0 && <div style={note}>{tr("The largest of the shell's separate pits was designed; {k} left out.", { k: res.partsDropped })}</div>}{/* #1899 */}
          {res.cell > res.faceRun && <div style={warn}>{tr("The design cell ({c} m) is wider than a face ({f} m): faces and berms are not drawn at this size, and the surface is the shell stepped to bench floors.", { c: res.cell.toFixed(1), f: res.faceRun.toFixed(1) })}</div>}{/* #1899 */}
          {Number(res.shell?.gridCellM?.[0]) > Number(res.inputs?.benchH) && <div style={note}>{tr("The shell's walls are {d} m block steps, wider than a {h} m bench: the shell's waste understates what the benched walls take out.", { d: res.shell.gridCellM[0], h: res.inputs.benchH })}</div>}{/* #1899 */}
          {!res.daylights && <div style={warn}>{tr("The walls never met the ground: the design stops at the top bench.")}</div>}
          {res.groundSource === "collars" && <div style={note}>{tr("The ground is interpolated between the collars, not a terrain.")}</div>}
          {res.groundSource === "model top" && <div style={note}>{res.modelMissing ? tr("No terrain and no collars: the top of the shell is taken as flat ground.") : tr("No terrain and no collars: the ground is the top of the block model's columns, interpolated between them.")}</div>}{/* #1850 */}
          <div style={{ marginTop: 6, maxHeight: 220, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 4 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-xs)" }}>
              <thead><tr style={{ position: "sticky", top: 0, background: "var(--color-bg)" }}>{[tr("Floor"), tr("Ore t"), tr("Grade"), tr("Waste t"), tr("Strip")].map((h) => <th key={h} style={{ textAlign: "right", padding: "2px 4px", borderBottom: "1px solid var(--color-border)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>{[...res.benches].reverse().map((b) => (
                <tr key={b.rl}><td style={cellStyle}>{Math.round(b.rl)}</td><td style={cellStyle}>{big(b.oreT)}</td><td style={cellStyle}>{b.meanGrade == null ? "—" : Number(b.meanGrade.toPrecision(3))}</td><td style={cellStyle}>{big(b.wasteT)}</td><td style={cellStyle}>{b.oreT > 0 ? (b.wasteT / b.oreT).toFixed(1) : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            <button onClick={exportStringsDxf} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }} title={tr("Crest and toe strings, one DXF layer per bench")}><Download size={13} /> {tr("Strings DXF")}</button>
            <button onClick={exportStringsCsv} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }}><Download size={13} /> {tr("Strings CSV")}</button>
            <button onClick={exportBenchesCsv} style={{ ...pBtn, width: "auto", flex: 1, marginBottom: 0 }}><Download size={13} /> {tr("Benches CSV")}</button>
          </div>
          <div style={{ ...note, marginTop: 4 }}>{tr("A geometric design on a conceptual shell, at your bench, berm and face angle. It is not a Mineral Reserve or Resource.")}</div>
        </div>
      )}
    </div>
  );
}
const cellStyle = { textAlign: "right", padding: "2px 4px", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" };
const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer", fontSize: "inherit", textDecoration: "underline" }; // #1952
const label = { fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.3 }; // #1948
const iconBtnStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, padding: 0, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 };
