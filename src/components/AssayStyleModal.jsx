import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926
import React, { useMemo, useState } from "react";
import { Plus, Trash2, RotateCcw } from "./icons.js";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap, #238)
import { backdropProps } from "../lib/modalStyles.js";
import { seedBreaks, nextDarkerClassColor, majorComponentSteps, logClassLimits } from "../lib/colorRamp.js"; // TASKS.csv #319 / #476; #701; #2935
import { roundBreaks, addClassLimit } from "../lib/assayClasses.js"; // TASKS.csv #2519
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { SHAPES } from "../lib/layerStyle.js"; // TASKS.csv #649 — the same marker shapes as the other point layers
import { ASSAY_AUTO_LIMIT, ASSAY_TRACE } from "../lib/viewer/assayShape.js"; // TASKS.csv #2932 — Automatic and Along the hole
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { gradeText } from "../lib/gradeText.js"; // TASKS.csv #2515
import { gradeUnitLabel } from "../lib/geochemColumns.js"; // TASKS.csv #3775 (1)
import { useStore } from "../lib/store.jsx";
import { drillThresholdOffers } from "../lib/thresholds.js"; // TASKS.csv #2688
import { relabelAfterLimit } from "../lib/classLabels.js"; // TASKS.csv #3571

// seedBreaks moved to lib/colorRamp.js (TASKS.csv #476) so the 3D view can seed breaks without loading this modal.

export default function AssayStyleModal({ symbol, unit, defaultColor, range, style, onChange, onClose }) {
  const unitLbl = gradeUnitLabel(symbol, unit); // TASKS.csv #3775 (1) — g/t for a precious metal stored in ppm, as the legend and Identify say it (the logic below keeps the stored unit)
  const [local, setLocal] = useState(() => ({
    color: style?.color || defaultColor,
    sizeMult: style?.sizeMult ?? 1,
    shape: style?.shape || "auto", // #649; #2932 — none stored = automatic
    opacity: style?.opacity ?? 1, // #649
    minCutoff: style?.minCutoff ?? "",
    breaks: style?.breaks ? style.breaks.map((b) => ({ ...b })) : [],
  }));

  const commit = (next) => {
    setLocal(next);
    onChange({
      color: next.color,
      sizeMult: next.sizeMult,
      shape: next.shape === "auto" ? null : next.shape, // #649 — only a change is stored; #2932 — a chosen Sphere is stored too
      opacity: next.opacity >= 1 ? null : next.opacity,
      minCutoff: next.minCutoff === "" ? null : Number(next.minCutoff),
      breaks: next.breaks.length ? next.breaks.slice().sort((a, b) => a.max - b.max) : null,
    });
  };

  const addBreak = () => {
    if (!local.breaks.length) {
      // Seed with a sensible 3-class split of the element's real data range so the user has something
      // concrete to edit rather than a blank row — same "nice round numbers" spirit as the scale-bar
      // helper elsewhere in the app, just simpler (no cartographic convention needed here).
      commit({ ...local, breaks: seedBreaks({ ...range, unit }, local.color) }); // #319 — seed from THIS element's colour
      return;
    }
    const last = local.breaks[local.breaks.length - 1];
    commit({ ...local, breaks: [...local.breaks, { max: +(last.max * 1.5).toFixed(3), color: nextDarkerClassColor(local.color, last.color), label: "" }] }); // #701
  };
  const updateBreak = (i, patch) => {
    // #319 — a break the user has touched is theirs: drop the `seeded` tag so nothing later treats it
    // as something GeoStrix picked and is free to replace.
    let breaks = local.breaks.map((b, bi) => (bi === i ? { ...b, ...patch, seeded: false } : b));
    if ("max" in patch && !("label" in patch)) breaks = relabelAfterLimit(local.breaks, breaks, i); // TASKS.csv #3571 — a generated label follows its limit
    commit({ ...local, breaks });
  };
  const removeBreak = (i) => commit({ ...local, breaks: local.breaks.filter((_, bi) => bi !== i) });
  // TASKS.csv #2519 — round limits, and a typed cut-off (the deposit's economic grade) as a class limit
  const [cutoff, setCutoff] = useState("");
  const roundAll = () => commit({ ...local, breaks: roundBreaks(local.breaks) });
  const addCutoff = () => { if (cutoff === "" || !Number.isFinite(Number(cutoff))) return; commit({ ...local, breaks: addClassLimit(local.breaks, Number(cutoff), local.color) }); setCutoff(""); };
  // TASKS.csv #2688 (#2675 part 1, Matt's decision on #2196 / #2347) — a saved DRILL threshold for this element, in this unit, is
  // OFFERED as a class limit (never applied): a click splits the class holding it there, seeding the default classes first
  const { geochemThresholds } = useStore();
  const offers = useMemo(() => drillThresholdOffers(geochemThresholds, symbol, unit).slice(0, 4), [geochemThresholds, symbol, unit]);
  const addOffer = (v) => commit({ ...local, breaks: addClassLimit(local.breaks.length ? local.breaks : seedBreaks({ ...range, unit }, local.color), v, local.color) });
  const basis = range?.basis;
  const basisText = !basis || !basis.n ? null : basis.kind === "flags" ? tr("Default classes: the 50th, 90th and 97.5th percentiles of the {n} detected values; the {left} reported below detection ('<') are left out.", { n: basis.n.toLocaleString(), left: basis.left.toLocaleString() }) : basis.kind === "floor" ? tr("Default classes: the 50th, 90th and 97.5th percentiles of the {n} values above the floor {floor} {unit}; the {left} at the floor (probably half a detection limit) are left out.", { n: basis.n.toLocaleString(), left: basis.left.toLocaleString(), floor: gradeText(basis.floor), unit: unitLbl }) : tr("Default classes: the 50th, 90th and 97.5th percentiles of all {n} values.", { n: basis.n.toLocaleString() });

  // TASKS.csv #2935 — Reset gives the seeded classes the dialog calls the default (was no classes: 'sphere size = grade', one colour)
  const reset = () => commit({ color: defaultColor, sizeMult: 1, shape: "auto", opacity: 1, minCutoff: "", breaks: seedBreaks({ ...range, unit }, defaultColor) });
  const major = majorComponentSteps({ ...range, unit });
  const logLims = !major ? logClassLimits(range) : null; // #3260

  // TASKS.csv #4073 (Matt: "similar for all pop up windows"; "too wordy … cut, don't just cap") — a StepDialog of two steps: Markers (colour, shape,
  // opacity, size) and Classes (the data range, Ignore below, the grade classes and their tools, Reset), Done the gold primary. Every change is still
  // applied as it is made (commit). What Size and the classes mean, how a sample picks its class and how the default classes were made moved into
  // the Help card; the note on the samples sitting at half a detection limit stays seen on Classes.
  const [at, setAt] = useState(0);
  const heading = tr("Style {symbol}", { symbol }); // the dialog's name, seen (a JSX title= would count it as a tooltip)
  const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 };
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{heading}</summary>
      <div style={note}><b>{tr("Size")}</b>{" "}{tr("Multiplies the value-scaled marker size (1 = default). Every marker for this element scales by this factor, keeping the same 'bigger = higher grade' relationship.")}</div>
      <div style={{ ...note, marginTop: 6 }}><b>{tr("Grade classes (recategorize)")}</b>{" "}{tr("Recategorize: instead of one flat colour, split this element into grade classes, each with its own colour — like a graduated/categorized legend.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("A sample takes the colour of the first class whose value is ≤ its threshold; a value above every threshold takes the top class's colour, so none disappears.")}</div>
      {(major || logLims || basisText) && !local.breaks.some((b) => b.seeded === false) /* #2941 — not once a class was edited (rounded, a limit added) */ && <div style={{ ...note, marginTop: 6 }}>{major ? tr("Default classes: round steps of the data, as for a major component (a median of {p50} {unit}): {limits}.", { p50: +range.p50.toFixed(2), unit: unitLbl, limits: major.join(" / ") }) : logLims ? tr("Default classes: round limits on a log scale between the median ({p50}) and the 97.5th percentile ({p975}): {limits} {unit}.", { p50: +Number(range.p50).toPrecision(3), p975: +Number(range.p975).toPrecision(3), limits: logLims.join(" / "), unit: unitLbl }) /* #3260 */ : basisText}</div>}{/* #2519; #2935 */}
    </details>
  );
  const steps = [
    { key: "markers", label: tr("Markers"), primary: { label: tr("Next") }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {!local.breaks.length && (
          <label style={row}>
            <span style={rowLabel}>{tr("Colour")}</span>
            <input type="color" value={local.color} onChange={(e) => commit({ ...local, color: e.target.value })} style={colorInp} />
          </label>
        )}
        {/* TASKS.csv #649 — shape and opacity, like the other layers' style panel */}
        <label style={row}>
          <span style={rowLabel}>{tr("Shape")}</span>
          <select value={local.shape} onChange={(e) => commit({ ...local, shape: e.target.value })} aria-label={tr("Marker shape")} style={{ ...inp, flex: 1, minWidth: 0 }}>{/* #3280 (6) — its longest option overflowed the dialog by 30 px */}
            <option value="auto">{tr("Automatic: spheres, or along the hole above {n} samples", { n: ASSAY_AUTO_LIMIT.toLocaleString() })}</option>
            {SHAPES.point.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            <option value={ASSAY_TRACE}>{tr("Along the hole")}</option>
          </select>
        </label>
        <label style={row}>
          <span style={rowLabel}>{tr("Opacity")}</span>
          <input type="range" min="0.1" max="1" step="0.05" value={local.opacity} onChange={(e) => commit({ ...local, opacity: Number(e.target.value) })} aria-label={tr("Marker opacity")} style={{ flex: 1 }} />
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", width: 34, textAlign: "right" }}>{Math.round(local.opacity * 100)}%</span>
        </label>
        <label style={row}>
          <span style={rowLabel}>{tr("Size")}</span>
          <input type="range" min="0.3" max="3" step="0.1" value={local.sizeMult} onChange={(e) => commit({ ...local, sizeMult: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", width: 34, textAlign: "right" }}>{local.sizeMult.toFixed(1)}×</span>
        </label>
      </div>
    ) },
    { key: "classes", label: tr("Classes"), primary: { label: tr("Done"), onClick: onClose }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{range.basis?.kind === "flags" && Number.isFinite(range.basis.limit) /* #2216 — the substitutes are not data */ ? tr("Data range: <{dl} ({n} below detection) – {max} {unit}", { dl: gradeText(range.basis.limit), n: range.basis.left.toLocaleString(), max: gradeText(range.max), unit: unitLbl }) : tr("Data range: {min} – {max} {unit}", { min: gradeText(range.min), max: gradeText(range.max), unit: unitLbl }) /* gradeText: #2515 */}</div>
        <label style={row}>
          <span style={rowLabel} title={tr("Samples below this grade aren't drawn at all — declutters low/background values.")}>{tr("Ignore below")}</span>
          <NumberInput allowEmpty placeholder={tr("none")} value={local.minCutoff === "" ? null : local.minCutoff} onChange={(v) => commit({ ...local, minCutoff: v == null ? "" : v })} aria-label={tr("Ignore below")} style={{ ...inp, width: 100 }} />{/* TASKS.csv #3926 — a comma reads too */}
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{unitLbl}</span>
        </label>
        <div>
          {!local.breaks.length && <button type="button" onClick={addBreak} className="gs-btn gs-btn--sm" style={{ marginBottom: 6 }}><Plus size={12} />{" "}{tr("Add classes")}</button>}
          {range.basis?.pile && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("{pct} % of the samples sit on the column's lowest value, {v} {unit}: likely half a detection limit, not a measured grade. They fall in the palest class.", { pct: Math.round(range.basis.pile.share * 100), v: gradeText(range.basis.pile.value), unit: unitLbl })}</div> /* TASKS.csv #3773 */}
          {offers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{/* #2688 — offered, never applied */}
              <span>{tr("Saved threshold:")}</span>
              {offers.map((o) => {
                const has = local.breaks.some((b) => b.max === o.value);
                return <button key={o.key} type="button" disabled={has} onClick={() => addOffer(o.value)} className="gs-btn gs-btn--sm" style={{ padding: "1px 6px", opacity: has ? 0.6 : 1, cursor: has ? "default" : "pointer" }}
                  title={has ? tr("Already a class limit.") : tr("{rule}{pop}, decided {date}. Click to add it as a class limit.", { rule: o.rule, pop: o.population ? ` (${o.population})` : "", date: o.decided })}>
                  {o.population ? `${o.population.split(": ").pop()} ` : ""}{gradeText(o.value)} {unitLbl}</button>;
              })}
            </div>
          )}
          {local.breaks.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>{/* #2519 */}
              <button type="button" onClick={roundAll} className="gs-btn gs-btn--sm" title={tr("Round every class limit to two significant figures")}>{tr("Round the limits")}</button>
              <NumberInput allowEmpty value={cutoff} onChange={(v) => setCutoff(v == null ? "" : String(v))} placeholder={tr("Cut-off ({unit})", { unit: unitLbl })} aria-label={tr("Cut-off to add as a class limit")} style={{ width: 110, fontSize: "var(--font-size-sm)", padding: "3px 6px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text)" }} />
              <button type="button" onClick={addCutoff} disabled={cutoff === ""} className="gs-btn gs-btn--sm" title={tr("Split the class holding this grade there, so the economic cut-off is a class limit")}>{tr("Add as a class limit")}</button>
            </div>
          )}
          {local.breaks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {local.breaks.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="color" value={b.color} onChange={(e) => updateBreak(i, { color: e.target.value })} style={colorInp} aria-label={tr("Class {v} colour", { v: i + 1 })} />
                  <input
                    placeholder={tr("Label")}
                    aria-label={tr("Class {v} label", { v: i + 1 })} // #687
                    value={b.label || ""}
                    onChange={(e) => updateBreak(i, { label: e.target.value })}
                    style={{ ...inp, width: 90 }}
                  />
                  <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>≤</span>
                  <NumberInput value={b.max} aria-label={tr("Class {v} upper limit ({unit}), up to and including", { v: i + 1, unit: unitLbl })} onChange={(v) => updateBreak(i, { max: v ?? 0 })} style={{ ...inp, width: 90 }} />
                  <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{unitLbl}</span>
                  <Trash2 aria-label={tr("Remove this grade class")} title={tr("Remove this grade class")} role="button" tabIndex={0} onKeyDown={activateOnKey} size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon-strong)", marginLeft: "auto" }} onClick={() => removeBreak(i)} />
                </div>
              ))}
              <button type="button" onClick={addBreak} className="gs-btn gs-btn--sm" style={{ alignSelf: "flex-start" }}><Plus size={12} />{" "}{tr("Add class")}</button>
            </div>
          )}
        </div>
        <button type="button" onClick={reset} className="gs-btn gs-btn--sm" style={{ alignSelf: "flex-start" }}><RotateCcw size={12} />{" "}{tr("Reset to default")}</button>
      </div>
    ) },
  ];

  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(460px, 94vw)" overlayProps={backdropProps(onClose)} />;
}

const row = { display: "flex", alignItems: "center", gap: 8 };
const rowLabel = { fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", width: 96, flexShrink: 0 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const colorInp = { width: 34, height: 28, padding: 2, border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", cursor: "pointer", flexShrink: 0 };
