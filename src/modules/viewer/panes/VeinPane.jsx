// TASKS.csv #4070 — the Vein / dyke modelling pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "vein"` test inside
// is ModellingPanes' own, kept as it was.
import { Layers3, Waves } from "../../../components/icons.js";
import NumberInput from "../../../components/NumberInput.jsx"; // TASKS.csv #3926
import { t as tr } from "../../../lib/i18n.js";
import { smallSel } from "../../../lib/sidebarStyles.js";

export default function VeinPane({ miniField, paneHeader, runVeinModel, setVeinCellSize, setVeinDip, setVeinDipDir, setVeinSearchRadius, setVeinTarget, toolPane, veinBusy, veinCellSize, veinDip, veinDipDir, veinSearchRadius, veinTarget, vein_units }) {
  return (<>
{toolPane === "vein" && (<>
        {paneHeader("Vein / dyke modelling", Waves, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models a vein or dyke from its logged intervals as a midplane with a true thickness, so the hangingwall and footwall never cross. Runs in-app, no Python engine.")}</div>
        {vein_units.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("The list holds the Veins log and every lithology code whose role is cross-cutting in Modelling codes. A unit that is missing: set its role there.")}</div> /* TASKS.csv #3779 (8) — how a unit gets into the list */}
        {vein_units.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.4 }}>{tr("Set your vein codes' role to cross-cutting in Modelling codes: nothing to model yet, with no Veins log and no cross-cutting lithology code.")}</div>}{/* #2226 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Vein or dyke")} value={veinTarget} onChange={(e) => setVeinTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a vein / dyke…")}</option>
            {vein_units.map((u) => <option key={u} value={u}>{u.startsWith("litho:") ? tr("{code} (Lithology)", { code: u.slice(6) }) : u.startsWith("mcode:") ? tr("{code} (Modelling code)", { code: u.slice(6) }) : u}</option>)}{/* #2226; modelling codes: #2533 */}
          </select>
          <button
            onClick={() => runVeinModel(veinTarget)}
            disabled={!veinTarget || veinBusy}
            title={tr("Build paired hangingwall/footwall surfaces (and a closed solid when they do not cross) from the logged vein intervals (runs in-app)")}
            aria-label={tr("Build paired hangingwall/footwall surfaces (and a closed solid when they do not cross) from the logged vein intervals (runs in-app)")}
            className="gs-btn gs-btn--block" style={{ width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: veinTarget && !veinBusy ? 1 : 0.5, cursor: veinTarget && !veinBusy ? "pointer" : "default" }}
          >{veinBusy ? <span style={{ fontSize: "var(--font-size-sm)" }}>…</span> : <><Layers3 size={14} />{" "}{tr("Build vein")}</>}</button>{/* #2540 (1): a worded button, as every other tool */}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Grid spacing across the vein plane. 0 = auto (about 1/12 of the search radius).")}>{tr("Cell size (m)")}<NumberInput min={0} value={veinCellSize} onChange={(v) => setVeinCellSize(v)} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("In-plane search radius for the midplane and thickness, and how far the vein may extend past the outermost intercept. 0 = auto (about 1.5x the median intercept spacing).")}>{tr("Search (m)")}<NumberInput min={0} value={veinSearchRadius} onChange={(v) => setVeinSearchRadius(v)} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Optional: blank fits the vein's attitude from the intercept midpoints. Required when all intercepts lie on one section line, which cannot fix a plane.")}>{tr("Dip (°)")}<NumberInput min={0} max={90} allowEmpty value={veinDip === "" || veinDip == null ? null : veinDip} placeholder={tr("fit")} onChange={(v) => setVeinDip(v == null ? "" : String(v))} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("Optional. Dip DIRECTION (not strike), 0-360. Only used when a dip is also entered.")}>{tr("Dip dir (°)")}<NumberInput min={0} max={360} allowEmpty value={veinDipDir === "" || veinDipDir == null ? null : veinDipDir} placeholder={tr("fit")} onChange={(v) => setVeinDipDir(v == null ? "" : String(v))} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("0 = auto (from your intercept spacing). Blank dip / dip direction = fitted (or from oriented core when that disagrees). Adds a hangingwall and a footwall, and a closed solid for volume when the two do not cross. Between holes the shape is interpolated: a pinch-out or swell no hole cut will not show.")}</div>
        {veinBusy && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success-fg)", marginTop: -4, marginBottom: 8 }}>{tr("Building the vein pair…")}</div>}

        {/* TASKS.csv #142 — numeric implicit model (grade shell). Runs entirely in the browser (no
            sidecar): IDW onto a dense grid + marching cubes at the cutoff. Result lands in the
            Generated surfaces list below like any GemPy surface. */}
        </>)}
  </>);
}
