// TASKS.csv #1880 — the Mine Design tab's WASTE DUMP / STOCKPILE: a closed design string is the footprint (the platform at a crest
// elevation), the sides fall at the angle of repose until they meet the ground, and the solid between is the capacity: loose m3
// and the tonnes at an in-situ density over a swell factor, set against a pit shell's waste. Maths in lib/dumpDesign.js. Every
// number is the user's (#264): no crest, angle, density or swell is assumed.
import React, { useMemo, useRef, useState } from "react";
import { Mountain, Box } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { dumpFromFootprint, looseTonnes } from "../lib/dumpDesign.js";
import { collarGround, collarsLookUnderground } from "../lib/pitShell.js";
import { terrainGroundAt } from "../lib/viewer/geomath.js";
import { stringStats } from "../lib/designStrings.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import CollarLevelsNote from "./CollarLevelsNote.jsx"; // TASKS.csv #2584 — the lowest collar used where collars stand on benches

const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const warn = { ...note, color: "var(--color-warn-text-strong)", marginTop: 4 };
const num = { ...smallSel, width: 84 };
const big = (v) => new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v);
const EMPTY = { stringId: "", crestZ: "", repose: "", density: "", swell: "", pitId: "" };
let kept = null; // #1356 — the last inputs and result outlive the pane (this session)

// surfaces: the generated surfaces (pit shells for the comparison); onAdd as the pit pane's
export default function DumpPane({ surfaces = [], onAdd, onClose }) {
  const { designStrings = [], terrain, collars = [] } = useStore();
  const footprints = useMemo(() => designStrings.filter((s) => s.closed && s.vertices.length > 2 && !s.stopeRun /* #2601 — not a stope outline */), [designStrings]);
  // TASKS.csv #2444 (review #2325) — the benched designs too: their waste (with the walls stepped out) is what the dump must hold, not the shell's
  const pits = useMemo(() => surfaces.filter((s) => (s.type === "pit_shell" || s.type === "pit_design") && Number.isFinite(s.params?.wasteTonnes)), [surfaces]);
  const [f, setF] = useState(() => ({ ...EMPTY, ...(kept?.inputs || {}) }));
  const [res, setRes] = useState(() => kept?.result || null);
  const [msg, setMsg] = useState(null);
  const busy = useRef(false);
  const footprint = footprints.find((s) => s.id === f.stringId) || footprints[0] || null;
  const pit = pits.find((s) => s.id === f.pitId) || null;
  // TASKS.csv #2276 — not the surface between UNDERGROUND collars (a dump stood 168 m high at RL 86-250 under a surface near 400)
  const ug = useMemo(() => (terrain ? null : collarsLookUnderground(collars)), [terrain, collars]);
  const groundAt = useMemo(() => (terrain ? (x, y) => terrainGroundAt(terrain, x, y) : ug?.underground ? null : collarGround(collars)), [terrain, collars, ug]);
  const groundSource = terrain ? "terrain" : groundAt ? "collars" : "flat"; // groundAt: #2276
  const centre = useMemo(() => { if (!footprint) return null; const st = stringStats(footprint.vertices, true); const cx = (st.box[0] + st.box[3]) / 2, cy = (st.box[1] + st.box[4]) / 2; const g = groundAt ? groundAt(cx, cy) : NaN; return { x: cx, y: cy, ground: Number.isFinite(g) ? g : (st.box[2] + st.box[5]) / 2, area: st.area }; }, [footprint, groundAt]);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setMsg(null); };
  const v = (k) => (f[k] === "" ? null : Number(f[k]));
  const reposeBad = v("repose") != null && !(v("repose") >= 1 && v("repose") <= 89); // #1912; the range the message states (#1940)
  const swellBad = v("swell") != null && !(v("swell") >= 1); // #1940 — broken rock never takes less room
  const missing = !footprint || v("crestZ") == null || v("repose") == null || reposeBad || swellBad;
  const make = () => {
    if (missing || busy.current) return;
    busy.current = true;
    const t0 = performance.now();
    try {
      const r = dumpFromFootprint(footprint.vertices, { crestZ: v("crestZ"), reposeDeg: v("repose"), groundAt, flatZ: centre?.ground ?? null });
      if (!r) { setMsg(tr("No dump: the footprint needs three or more points and a known ground.")); setRes(null); kept = null; return; } // cleared: #1935
      if (!r.volume) { setMsg(tr("The crest is at or below the ground over the whole footprint: nothing stands above it.")); setRes(null); kept = null; return; }
      const tonnes = v("density") > 0 ? looseTonnes(r.volume, v("density"), v("swell") || 1) : null;
      const base = tr("Dump: {s}, crest {z} m at {a}°", { s: footprint.name, z: v("crestZ"), a: v("repose") });
      const taken = new Set(surfaces.map((s) => s.name)); let name = base; for (let k = 2; taken.has(name); k++) name = `${base} (${k})`; // #1910
      onAdd?.({ name, positions: r.positions, indices: r.indices, volumeM3: r.volume, type: "dump", closure: "closed", color: "#8d6e63", tag: "dump",
        tip: tr("Dump / stockpile: a platform at {z} m with sides at {a}°, down to the ground; a conceptual shape", { z: v("crestZ"), a: v("repose") }),
        params: { tool: "dump / stockpile from a footprint (platform at the crest, sides at the angle of repose to the ground)", footprint: footprint.name, crestZ: v("crestZ"), reposeDeg: v("repose"), density: v("density"), swell: v("swell"), looseVolumeM3: Math.round(r.volume), looseTonnes: tonnes == null ? null : Math.round(tonnes), footprintAreaM2: Math.round(centre?.area ?? r.footprintArea), footprintGridAreaM2: Math.round(r.footprintArea), dumpAreaM2: Math.round(r.dumpArea), ...(pit ? { comparedPit: pit.name, pitWasteTonnes: Number(pit.params.wasteTonnes) } : {}), maxHeightM: +r.maxHeight.toFixed(1), toeReachM: +r.toeReach.toFixed(1), groundFrom: groundSource, cellM: +r.cell.toFixed(2), caution: "a conceptual shape: no stability, lift, drainage or foundation check", generatedAt: new Date().toISOString() } });
      const result = { ...r, tonnes, name, seconds: Math.round((performance.now() - t0) / 100) / 10, pitWaste: pit ? Number(pit.params.wasteTonnes) : null, pitName: pit?.name || null, stringArea: centre?.area ?? null };
      kept = { inputs: { ...f }, result }; setRes(result); setMsg(null);
    } catch (e) { setMsg(e.message || String(e)); }
    finally { busy.current = false; }
  };
  const line = (label, val) => <div style={row}><span>{label}</span><b>{val}</b></div>;
  const field = (k, label, extra = {}) => <label style={row}>{label}<input type="number" step="any" value={f[k]} onChange={set(k)} style={num} {...extra} /></label>;

  return (
    <div>
      <TaskPaneHeader title="Dump / stockpile" icon={Mountain} tone="model" onClose={onClose} />
      <div style={note}>{tr("A closed design string is the footprint: a flat platform at the crest elevation whose sides fall at the angle of repose until they meet the ground. The solid between holds the capacity in loose cubic metres, and tonnes at an in-situ density over a swell factor, set against a pit shell's waste. A conceptual shape: no stability, lift, drainage or foundation check.")}</div>
      {!footprints.length && <div style={warn}>{tr("It needs a closed design string as the footprint: draw one with the Strings tool first.")}</div>}
      {footprints.length > 0 && (<>
        <label style={row}>{tr("Footprint")}<select value={footprint?.id || ""} onChange={set("stringId")} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Footprint string")}>{footprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {ug?.underground && <div style={note}>{tr("The collars look like underground drill positions ({upward} hole(s) drilled upward, {stacked} pair(s) of collars stacked over each other): they are not used as the ground. Load a terrain (Maps > Terrain) for the real surface.", { upward: ug.upward, stacked: ug.stacked })}</div>}{/* #2276 */}
        {centre && <div style={note}>{tr("{a} ha; the ground at its centre is {g} m ({src}).", { a: (centre.area / 10000).toFixed(2), g: Math.round(centre.ground), src: groundSource === "terrain" ? tr("the terrain") : groundSource === "collars" ? tr("interpolated between the collars") : tr("no terrain or collars: the footprint's own elevation, flat") })}</div>}
        {centre && groundSource === "collars" && <CollarLevelsNote collars={collars} />}
        {field("crestZ", tr("Crest elevation (m)"), { placeholder: centre ? String(Math.round(centre.ground)) : "" })}
        {field("repose", tr("Angle of repose (°)"), { min: 1, max: 89 })}
        {field("density", tr("In-situ density (t/m³)"), { min: 0, placeholder: tr("optional") })}
        {field("swell", tr("Swell factor"), { min: 1, placeholder: tr("optional"), title: tr("Broken rock takes more room than in place: the dump holds its volume ÷ swell of rock as it lay in place, so tonnes = volume × in-situ density ÷ swell.") })}
        {pits.length > 0 && <label style={row}>{tr("Compare with pit")}<select value={f.pitId} onChange={set("pitId")} style={{ ...smallSel, width: 0, flex: 1, minWidth: 0 }} aria-label={tr("Pit shell whose waste the dump is compared with")}><option value="">{tr("— none —")}</option>{pits.map((s) => <option key={s.id} value={s.id}>{String(s.name).replace(/^Pit shell: /, "")}</option>)}</select></label>}
        {pit && Number(pit.params?.inputs?.wasteDensity) > 0 && f.density === "" && <div style={note}><button onClick={() => setF((p) => ({ ...p, density: String(pit.params.inputs.wasteDensity) }))} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "1px 6px" }}>{tr("Use the pit's waste density, {v}", { v: pit.params.inputs.wasteDensity })}</button></div>}{/* TASKS.csv #2437 */}
        <button onClick={make} disabled={missing} style={{ ...pBtn, marginTop: 8, opacity: missing ? 0.5 : 1 }}><Box size={14} /> {tr("Make the dump")}</button>
        {reposeBad && <div style={warn}>{tr("The angle of repose must be between 1 and 89°.")}</div>}
        {swellBad && <div style={warn}>{tr("The swell factor is 1 or more: broken rock takes more room than in place, never less.")}</div>}{/* #1940 */}
        {missing && !reposeBad && <div style={note}>{tr("Enter the crest elevation and the angle of repose: neither has a default.")}</div>}
      </>)}
      {msg && <div style={warn}>{msg}</div>}
      {res && (
        <div style={{ marginTop: 8, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }}>
          {line(tr("Capacity (loose)"), `${big(res.volume)} m³`)}
          {res.tonnes != null && line(tr("Tonnes it holds"), `${big(res.tonnes)} t`)}
          {line(tr("Footprint / with slopes"), `${((res.stringArea ?? res.footprintArea) / 10000).toFixed(2)} / ${(res.dumpArea / 10000).toFixed(2)} ha`)}{/* the string's own area, the slopes' from the grid: #1939 */}
          {line(tr("Highest face"), `${res.maxHeight.toFixed(1)} m`)}
          {line(tr("Toe reach"), `${res.toeReach.toFixed(1)} m`)}
          {res.pitWaste != null && res.tonnes != null && line(tr("Holds of the pit's waste"), res.tonnes / res.pitWaste >= 10 ? tr("{x} times the {t} t", { x: Math.round(res.tonnes / res.pitWaste).toLocaleString(), t: big(res.pitWaste) }) : tr("{p} % of {t} t", { p: Math.round((res.tonnes / res.pitWaste) * 100).toLocaleString(), t: big(res.pitWaste) }))}{/* #1941 */}
          {res.pitWaste != null && res.tonnes == null && <div style={note}>{tr("Enter a density to compare the tonnes with the pit's {t} t of waste.", { t: big(res.pitWaste) })}</div>}
          {res.aboveCrestShare > 0 && <div style={warn}>{tr("{p} % of the footprint stands above the crest: no dump there.", { p: Math.round(res.aboveCrestShare * 100) })}</div>}
          {res.coarsened && <div style={warn}>{tr("The grid was made coarser to stay within the limit.")}</div>}
          {line(tr("Built in"), `${res.seconds} s`)}
          <div style={{ ...note, marginTop: 4 }}>{tr("\"{name}\" is in the generated surfaces with these figures. The capacity is the space between the shape and the ground as it is now.", { name: res.name })}</div>
        </div>
      )}
    </div>
  );
}
