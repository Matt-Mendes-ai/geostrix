// TASKS.csv #4070 — the Vein / dyke modelling pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "vein"` test inside
// is ModellingPanes' own, kept as it was.
import { useMemo, useState } from "react";
import { Layers3, Waves } from "../../../components/icons.js";
import { traceLines, tracedEvidence } from "../../../lib/traceFit.js"; // TASKS.csv #4103 — a vein or dyke from any imported line
import { terrainGroundAt } from "../../../lib/viewer/geomath.js";
import TraceFitBlock from "../TraceFitBlock.jsx";
import { buildVeinFromLine } from "../veinLine.js";
import MoreFold from "../../../components/MoreFold.jsx";
import StepPane, { StepNumbers } from "../../../components/StepPane.jsx";
import { veinResult } from "../../../lib/paneSteps.js";
import NumberInput from "../../../components/NumberInput.jsx"; // TASKS.csv #3926
import { t as tr } from "../../../lib/i18n.js";
import { smallSel } from "../../../lib/sidebarStyles.js";

export default function VeinPane({ implicitSurfaces, miniField, paneHeader, runVeinModel, setVeinCellSize, setVeinDip, setVeinDipDir, setVeinSearchRadius, setVeinTarget, toolPane, veinBusy, veinCellSize, veinDip, veinDipDir, veinSearchRadius, veinTarget, vein_units, props = {} }) {
  // TASKS.csv #4103 — "Use a line…": any imported line (KML / KMZ / shapefile / GeoJSON / drawn), whatever its attributes, draped on the terrain and fitted (a plane, or an order 2 / 3 surface)
  const [lineSel, setLineSel] = useState({ id: "", order: 1, heights: "auto", mapDip: false });
  const lines = useMemo(() => traceLines(props.mapLayers), [props.mapLayers]);
  const chosen = lineSel.id ? lines.find((l) => l.id === lineSel.id) || null : null;
  const traced = useMemo(() => (chosen ? tracedEvidence(chosen, { ground: props.terrain ? (x, y) => terrainGroundAt(props.terrain, x, y) : () => NaN, order: lineSel.order, heights: lineSel.heights, mapDip: lineSel.mapDip }) : null), [chosen, props.terrain, lineSel.order, lineSel.heights, lineSel.mapDip]);
  const [lineMsg, setLineMsg] = useState("");
  const buildLine = () => {
    const r = buildVeinFromLine({ res: traced, line: chosen, order: lineSel.order, terrain: props.terrain, traces: props.tracesRef?.current || [], addSurface: props.addWorldMeshSurface });
    setLineMsg(r.ok ? "" : tr("{name}: nothing to build inside its extent.", { name: chosen?.name || "" }));
  };
  const pickLine = (id) => { setLineSel({ id, order: 1, heights: "auto", mapDip: false }); if (id) setVeinTarget(""); setLineMsg(""); };
  return (<>
{toolPane === "vein" && (<>
        {paneHeader("Vein / dyke modelling", Waves, "model", true /* #4070 */)}
        {(() => { /* TASKS.csv #4070 (Matt's layout C) — one step: which vein or dyke -> Build vein; the numbers of the landing in Result; the rest in Fine-tune */
          const vr = veinResult(implicitSurfaces), m = (x) => (x == null ? "—" : `${Number(x).toFixed(2)} m`);
          return (
            <StepPane id="vein" label={tr("Vein / dyke modelling")}
              steps={[
                { key: "vein", label: tr("Vein"), question: tr("Which vein or dyke?"), hint: tr("Models a vein or dyke from its logged intervals as a midplane with a true thickness, so the hangingwall and footwall never cross. Runs in-app, no Python engine."), body: (<>
        {vein_units.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.4 }}>{tr("Set your vein codes' role to cross-cutting in Modelling codes: nothing to model yet, with no Veins log and no cross-cutting lithology code.")}</div>}{/* #2226 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Vein or dyke")} value={veinTarget} onChange={(e) => { setVeinTarget(e.target.value); setLineSel((p) => ({ ...p, id: "" })); setLineMsg(""); }} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a vein / dyke…")}</option>
            {vein_units.map((u) => <option key={u} value={u}>{u.startsWith("litho:") ? tr("{code} (Lithology)", { code: u.slice(6) }) : u.startsWith("mcode:") ? tr("{code} (Modelling code)", { code: u.slice(6) }) : u}</option>)}{/* #2226; modelling codes: #2533 */}
          </select>
        </div>
        {lines.length > 0 && (
          <div data-vein-line="" style={{ marginBottom: 8 }}>
            <select aria-label={tr("Use a line…")} value={lineSel.id} onChange={(e) => pickLine(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }}>
              <option value="">{tr("Use a line…")}</option>
              {lines.map((l) => <option key={l.id} value={l.id}>{tr("{name} — {layer}, {km} km", { name: l.name, layer: l.layerName, km: (l.lengthM / 1000).toFixed(1) })}</option>)}
            </select>
            {chosen && traced?.ok && <TraceFitBlock id={chosen.id} name={chosen.name} fit={traced.fit} sel={lineSel} hasZ={chosen.hasZ} setSel={(patch) => setLineSel((p) => ({ ...p, ...patch }))} onRemove={() => pickLine("")} />}
            {chosen && traced && !traced.ok && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 4 }}>{traced.why === "few" ? tr("{name}: fewer than three points to fit.", { name: chosen.name }) : tr("{name}: no height: no altitudes on the line and no terrain.", { name: chosen.name })}</div>}
            {chosen && traced?.ok && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4 }}>{tr("A line has no thickness: only the vein's surface is built.")}</div>}
            {lineMsg && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 4 }}>{lineMsg}</div>}
          </div>
        )}
                </>) },
              ]}
              action={{ label: chosen ? tr("Build the vein surface") : veinBusy ? tr("Building the vein pair…") : tr("Build vein"), onClick: () => (chosen ? buildLine() : runVeinModel(veinTarget)), disabled: chosen ? !traced?.ok : !veinTarget || veinBusy, icon: <Layers3 size={14} />,
                title: tr("Build paired hangingwall/footwall surfaces (and a closed solid when they do not cross) from the logged vein intervals (runs in-app)") }}
              result={{ key: vr?.key ?? null, body: vr && (vr.line ? <StepNumbers rows={[{ /* TASKS.csv #4103 — a surface from a traced line: no intercepts and no thickness */ label: tr("Points used"), value: Number(vr.line.points).toLocaleString(), title: vr.target },
                { label: tr("Dip / dip direction"), value: `${Math.round(vr.dip)}° / ${Math.round(vr.dipDir)}°`, title: vr.source },
                { label: tr("Shape"), value: vr.shape === "planar" ? tr("Planar") : tr("Curved") },
                { label: tr("Contact misfit (RMS)"), value: m(vr.rmsM) },
              ]} /> : <StepNumbers rows={[
                { label: tr("Intercepts"), value: Number(vr.intercepts).toLocaleString(), title: vr.target },
                { label: tr("True thickness, mean"), value: m(vr.meanM) },
                { label: tr("True thickness, range"), value: `${m(vr.minM)} – ${m(vr.maxM)}` },
                { label: tr("Dip / dip direction"), value: `${Math.round(vr.dip)}° / ${Math.round(vr.dipDir)}°`, title: vr.source },
                { label: tr("Shape"), value: vr.shape === "planar" ? tr("Planar") : tr("Curved") },
                { label: tr("Contact misfit (RMS)"), value: m(vr.rmsM) },
              ]} />) }}
              fineTune={<MoreFold summary={tr("Fine-tune…")} data-fine-tune="vein">
        {vein_units.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("The list holds the Veins log and every lithology code whose role is cross-cutting in Modelling codes. A unit that is missing: set its role there.")}</div> /* TASKS.csv #3779 (8) — how a unit gets into the list */}
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
              </MoreFold>} />
          );
        })()}
        </>)}
  </>);
}
