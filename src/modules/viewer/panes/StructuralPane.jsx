// TASKS.csv #4070 — the Structural modelling pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "structural"` test inside
// is ModellingPanes' own, kept as it was.
import { Compass, Layers3, Milestone } from "../../../components/icons.js";
import MoreFold from "../../../components/MoreFold.jsx";
import StepPane, { StepNumbers } from "../../../components/StepPane.jsx";
import { customAlphaPicks, zoneAlphaPicks } from "../../../lib/alphaPicks.js";
import { betaReferenceCounts } from "../../../lib/coreOrientation.js";
import { t as tr } from "../../../lib/i18n.js";
import { runResult } from "../../../lib/paneSteps.js";
import { useStore } from "../../../lib/store.jsx";
import { useMemo } from "react";

function AlphaOnlyHint({ layers, fallback }) {
  const { customLayers = [] } = useStore();
  const z = useMemo(() => zoneAlphaPicks(layers?.structzone).length, [layers?.structzone]);
  const c = useMemo(() => customAlphaPicks(customLayers), [customLayers]);
  if (!z && !c.length) return fallback;
  const where = [z ? tr("{n} from Structural zones", { n: z }) : null, ...[...new Set(c.map((p) => p.source))].map((s) => tr("{n} from {source}", { n: c.filter((p) => p.source === s).length, source: s }))].filter(Boolean).join("; ");
  return <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45, marginBottom: 8 }}>{tr("No oriented structure picks. These tools need a dip direction: oriented core (alpha and beta) or a Structure planes import. Angles to the core axis ({where}) are alpha-only: the Stereonet, Downhole plot and sections still show them.", { where })}</div>;
}

export default function StructuralPane({ implicitSurfaces, emptyPaneHint, gempyTitle, implicitBusy, layers, modelArea, paneHeader, runStructuralModel, setCoreOrientOpen, setStereonetOpen, setStructuralTarget, setTadpoleOpen, structCounts, struct_types, structuralTarget, surfaceStructures, toolPane }) {
  return (<>
{toolPane === "structural" && (<>
        {paneHeader("Structural modelling", Compass, "model", true /* #4070 */)}
        {(() => { /* TASKS.csv #4070 (Matt's layout C) — one step: which structure type -> Run; the surfaces of the run in numbers in Result; the picks' own checks (core orientation, stereonet, tadpole) in Fine-tune */
          const sr = runResult(implicitSurfaces), m = (x) => (x == null ? "—" : `${x} m`);
          return (
            <StepPane id="structural" label={tr("Structural modelling")}
              steps={[
                { key: "type", label: tr("Type"), question: tr("Which structure type?"), hint: tr("Models a surface from one structure-plane type (e.g. a fault or shear) using each pick's own position and dip/azimuth — no separate contact layer needed."), body: (<>
        {!struct_types.length && <AlphaOnlyHint layers={layers} fallback={emptyPaneHint(tr("No structure picks loaded — import downhole structure planes on the StrixViewer tab (Add layer › Structure planes), or load the sample project."))} />}{/* #1686 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Structure type")} value={structuralTarget} onChange={(e) => setStructuralTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a structure type…")}</option>
            {struct_types.map((u) => { const c = structCounts.get(u) || { n: 0, k: 0, an: 0, ak: 0 }; return <option key={u} value={u} disabled={!(modelArea === "checked" ? c.ak : c.k)}>{modelArea === "checked" ? tr("{type} · {k} of {n} oriented in the model area ({k2} of {n2} in the project)", { type: u, k: c.ak, n: c.an, k2: c.k, n2: c.n }) : tr("{type} · {k} of {n} oriented", { type: u, k: c.k, n: c.n })}</option>; })}{/* #1553 */}
          </select>
        </div>
                </>) },
              ]}
              action={{ label: implicitBusy ? tr("Building structures…") : tr("Build structures"), onClick: () => runStructuralModel(structuralTarget), disabled: !structuralTarget || implicitBusy, icon: <Layers3 size={14} aria-hidden="true" />,
                title: gempyTitle(!struct_types.length ? tr("No structure picks with an orientation yet.") : !structuralTarget ? tr("Choose a structure type first.") : null) }}
              result={{ key: sr?.runId ?? null, body: sr && <StepNumbers rows={[
                { label: tr("Surfaces"), value: sr.n.toLocaleString(), title: sr.names.join(", ") },
                { label: tr("Typical miss"), value: m(sr.typicalMissM), title: tr("How far the surfaces pass from the logged contacts, typically") },
                { label: tr("Worst miss"), value: m(sr.worstMissM) },
                sr.left ? { label: tr("Contacts left out"), value: `${sr.left.toLocaleString()} / ${sr.of.toLocaleString()}`, level: "some" } : null,
              ]} /> }}
              fineTune={<MoreFold summary={tr("Fine-tune…")} data-fine-tune="structural">
        {/* User request: "we need to find a way to calculate the beta angle for non-oriented drilling
            based on field structural measurements" — the alpha-beta method (coreOrientation.js), placed
            right above the Stereonet QC button since it's the natural upstream step: solve a pick's true
            orientation here, then feed it (or the whole layer) into that QC/trend-checking tool. */}
        <button
          onClick={() => setCoreOrientOpen(true)}
          className="gs-btn gs-btn--block" style={{ marginBottom: 8 }}
          title={tr("Recover a non-oriented core pick's true dip/dip-direction by calibrating against a known field/outcrop structural reading")}
        ><Compass size={14} />{" "}{tr("Core orientation calculator")}</button>
        {/* TASKS.csv #141 — check the structure picks' own orientation trend/scatter BEFORE feeding them
            into the anisotropy or structural-surface tools above/below. */}
        <button
          onClick={() => setStereonetOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth)) && !(surfaceStructures || []).some((st) => (st.rows || []).length)} // #428: outcrop data alone is enough
          className="gs-btn gs-btn--block" style={{ marginBottom: 8, opacity: (layers.structure || []).length || (surfaceStructures || []).length ? 1 : 0.5, cursor: (layers.structure || []).length || (surfaceStructures || []).length ? "pointer" : "default" }}
          title={tr("Pole-plot / great-circle stereonet of the Structure layer's downhole picks and/or outcrop measurements")}
        ><Milestone size={14} />{" "}{tr("Stereonet (QC picks)")}</button>
        {/* TASKS.csv #277 — the downhole (tadpole) view, sitting next to the Stereonet because the two
            are the pair a geologist works structural data with: this one answers "where in the hole,
            and does it change at a contact", the stereonet answers "what is the orientation
            population". Neither replaces the other, and this one is normally opened first. */}
        <button
          onClick={() => setTadpoleOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth))}
          className="gs-btn gs-btn--block" style={{ marginBottom: 8, opacity: (layers.structure || []).length ? 1 : 0.5, cursor: (layers.structure || []).length ? "pointer" : "default" }}
          title={tr("Downhole tadpole plot — depth vs alpha/dip with an azimuth tail, plus lithology and structure-frequency tracks, per hole")}
        ><Milestone size={14} />{" "}{tr("Downhole structure (tadpole)")}</button>
        {(() => { const b = betaReferenceCounts(layers.structure || []); return b.top + b.bottom > 0 ? <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.4 }}>{[b.bottom && tr("{n} of these picks were oriented from alpha / beta with beta measured from the {ref}-of-hole line, as chosen when they were imported (a structure file does not say). Had the core been marked on the other line, each would plot elsewhere, by tens of degrees for some.", { n: b.bottom.toLocaleString(), ref: tr("bottom") }), b.top && tr("{n} of these picks were oriented from alpha / beta with beta measured from the {ref}-of-hole line, as chosen when they were imported (a structure file does not say). Had the core been marked on the other line, each would plot elsewhere, by tens of degrees for some.", { n: b.top.toLocaleString(), ref: tr("top") })].filter(Boolean).join(" ")}</div> : null; })()}{/* #2055 */}
              </MoreFold>} />
          );
        })()}

        </>)}
  </>);
}
