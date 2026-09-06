import React, { useState } from "react";
import { X, Plus, Trash2, RotateCcw } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";

// User request: "I wanna be able to change the assay legend. Change colour, size, recategorize,
// ignore values lower than (what the user specifies)". Per-element styling for the 3D View / cross-
// section assay markers — previously each toggled-on element got a hardcoded fixed hue and a
// continuous 1.2-3.8 size range with no way to touch either, and every sample rendered regardless of
// grade. This modal edits one element's entry in ViewerModule's `assayStyle` state:
//   { color: "#rrggbb" | null, sizeMult: number, minCutoff: number | null, breaks: [{max,color,label}] }
// `onChange` is called with the full next style object on every edit (ViewerModule owns the actual
// state and re-renders the 3D scene from it); this component is otherwise stateless about what's
// already been applied, just a plain controlled editor over the `style` prop.
// TASKS.csv #247 — the same "nice 3-class split of the element's real data range" this modal's own
// "Add break" button already seeded with (below), pulled out so ViewerModule can also use it to give a
// newly-toggled-on element a grade-based ramp by default instead of a flat color — a 0.01 g/t and a
// 50 g/t intercept looking identical until a user finds this modal's gear icon was a real first-look
// gap for a tool whose whole point is spotting where the high-grade intercepts sit in 3D.
//
// TASKS.csv #306 — #247's seeding was RIGHT in principle and degenerate in practice, and the numbers
// are the whole argument. The class boundaries were EQUAL-INTERVAL (min + span/3, min + 2·span/3),
// which is the wrong classifier for geochemical assay data: it is lognormal, a large background
// population plus a long anomalous tail spanning three to five orders of magnitude. Measured over the
// bundled 37-hole harry_property assay_wide.csv (6,297 intervals, 14 elements), equal-interval put
// 99.8-100.0% of every ore/pathfinder element into class 1 — Au 99.9/0.1/0.1, Cu 99.9/0.0/0.0,
// Pb 100.0/0.0/0.0, Zn 99.9/0.0/0.0, Ag 99.8/0.2/0.0, As 99.8/0.1/0.0. So the ramp existed but every
// sphere in the view was the same grey; on screen a whole 37-hole Au view showed exactly ONE
// non-grey marker. Two alternatives were measured and rejected before landing on percentiles:
//   • jenks (classifyBreaks' 'jenks', suggested by this row and already implemented for #291) —
//     minimises within-class variance in LINEAR space, so on this data it just fences off the
//     outliers: still 99.2/0.8/0.0 for Au, 99.5/0.5/0.0 for Cu. Barely better than equal-interval.
//   • geometric/log spacing from min·(max/min)^(k/3) — excellent for the trace elements
//     (Au 77.2/21.8/1.0) but it inverts on the near-normally-distributed major oxides in the same
//     file, where the minimum is a tiny outlier: K 0.0/0.7/99.2, Al 0.0/0.0/99.9. A default has to
//     work for both, and this dataset contains both.
// PERCENTILE (p50/p90) boundaries are used instead: robust to distribution shape by construction,
// they give ~50/40/10 for anything — lognormal trace element or near-normal major oxide alike — which
// is also the geologically conventional read (background / anomalous / strongly anomalous). They need
// the element's actual distribution rather than just its range, so ViewerModule's globalAssayRanges
// now carries p50/p90 alongside min/max; if a caller passes a range without them (an older saved
// project's shape, or any future caller) this falls back to the original equal-interval split rather
// than throwing.
// The class COLOURS changed too. The old grey #5a6472 -> amber #e2a63c -> red #e05a4a ramp is not
// monotonic in lightness (L* 42.0 -> 72.1 -> 55.7), i.e. the "High" class read as LESS extreme than
// "Medium" in greyscale and under simulated deuteranopia. These markers sit on a light background, so
// salience against that background is the channel that has to increase with grade: this ramp runs
// pale-and-low-chroma -> saturated -> near-black-red, L* 88.9 -> 65.2 -> 33.4, strictly DECREASING, so
// low grade recedes into the scene and high grade advances out of it (contrast against the viewport
// background #f4f5f7: 1.22 -> 2.45 -> 7.57, i.e. salience rises monotonically with grade, which the old
// ramp's 5.50 -> 1.97 -> 3.36 did not). Adjacent-class separation under a Vienot-1999 deuteranopia
// simulation is 142.3 and 123.0 units of simulated-sRGB distance (protanopia 150.5 / 126.3), against
// 139.6 / 57.1 for the old ramp — so the weak step is gone as well. Not a rainbow/jet ramp,
// deliberately: those manufacture false class boundaries in continuous data.
export function seedBreaks(range) {
  const { min, max, p50, p90 } = range || {};
  const span = max - min;
  const C = ["#f2ddb8", "#e0894a", "#8c2f1f"]; // low / medium / high — see the lightness argument above
  if (!(span > 0)) return [{ max: max || 1, color: C[2], label: "All" }];
  // Percentile boundaries when the caller supplied a distribution; equal-interval otherwise.
  const usable = Number.isFinite(p50) && Number.isFinite(p90) && p50 > min && p90 > p50 && p90 < max;
  const b1 = usable ? p50 : min + span / 3;
  const b2 = usable ? p90 : min + (2 * span) / 3;
  // toFixed(3) is the original rounding, kept so the numbers in the break editor stay readable — but a
  // trace-element percentile can legitimately be smaller than 0.001 (Au p50 on this dataset is 0.033,
  // and a lower-grade property would go below 0.001), and rounding those to 0.000 would collapse the
  // low class back to nothing. Below that scale, keep three SIGNIFICANT figures instead of three
  // decimal places.
  const round = (v) => (Math.abs(v) >= 0.001 ? +v.toFixed(3) : +v.toPrecision(3));
  return [
    { max: round(b1), color: C[0], label: "Low" },
    { max: round(b2), color: C[1], label: "Medium" },
    { max: round(max), color: C[2], label: "High" },
  ];
}

export default function AssayStyleModal({ symbol, unit, defaultColor, range, style, onChange, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const [local, setLocal] = useState(() => ({
    color: style?.color || defaultColor,
    sizeMult: style?.sizeMult ?? 1,
    minCutoff: style?.minCutoff ?? "",
    breaks: style?.breaks ? style.breaks.map((b) => ({ ...b })) : [],
  }));
  const [breakDraftError, setBreakDraftError] = useState("");

  const commit = (next) => {
    setLocal(next);
    onChange({
      color: next.color,
      sizeMult: next.sizeMult,
      minCutoff: next.minCutoff === "" ? null : Number(next.minCutoff),
      breaks: next.breaks.length ? next.breaks.slice().sort((a, b) => a.max - b.max) : null,
    });
  };

  const addBreak = () => {
    if (!local.breaks.length) {
      // Seed with a sensible 3-class split of the element's real data range so the user has something
      // concrete to edit rather than a blank row — same "nice round numbers" spirit as the scale-bar
      // helper elsewhere in the app, just simpler (no cartographic convention needed here).
      commit({ ...local, breaks: seedBreaks(range) });
      return;
    }
    const last = local.breaks[local.breaks.length - 1];
    commit({ ...local, breaks: [...local.breaks, { max: +(last.max * 1.5).toFixed(3), color: "#e05a4a", label: "" }] });
  };
  const updateBreak = (i, patch) => {
    const breaks = local.breaks.map((b, bi) => (bi === i ? { ...b, ...patch } : b));
    commit({ ...local, breaks });
  };
  const removeBreak = (i) => commit({ ...local, breaks: local.breaks.filter((_, bi) => bi !== i) });

  const reset = () => commit({ color: defaultColor, sizeMult: 1, minCutoff: "", breaks: [] });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "var(--color-accent-dark)", fontWeight: 600 }}>Style {symbol}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>Data range: {range.min} – {range.max} {unit}</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
          {!local.breaks.length && (
            <label style={row}>
              <span style={rowLabel}>Colour</span>
              <input type="color" value={local.color} onChange={(e) => commit({ ...local, color: e.target.value })} style={colorInp} />
            </label>
          )}

          <label style={row}>
            <span style={rowLabel} title="Multiplies the value-scaled marker size (1 = default). Every marker for this element scales by this factor, keeping the same 'bigger = higher grade' relationship.">Size</span>
            <input type="range" min="0.3" max="3" step="0.1" value={local.sizeMult} onChange={(e) => commit({ ...local, sizeMult: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 34, textAlign: "right" }}>{local.sizeMult.toFixed(1)}×</span>
          </label>

          <label style={row}>
            <span style={rowLabel} title="Samples below this grade aren't drawn at all — declutters low/background values.">Ignore below</span>
            <input type="number" step="any" placeholder="none" value={local.minCutoff} onChange={(e) => commit({ ...local, minCutoff: e.target.value })} style={{ ...inp, width: 100 }} />
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{unit}</span>
          </label>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ ...rowLabel, marginBottom: 0 }} title="Recategorize: instead of one flat colour, split this element into grade classes, each with its own colour — like a graduated/categorized legend.">Grade classes (recategorize)</span>
              {!local.breaks.length && <button onClick={addBreak} style={smallBtn}><Plus size={11} /> Add classes</button>}
            </div>
            {local.breaks.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {local.breaks.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="color" value={b.color} onChange={(e) => updateBreak(i, { color: e.target.value })} style={colorInp} />
                    <input
                      placeholder="Label"
                      value={b.label || ""}
                      onChange={(e) => updateBreak(i, { label: e.target.value })}
                      style={{ ...inp, width: 90 }}
                    />
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>≤</span>
                    <input
                      type="number" step="any"
                      value={b.max}
                      onChange={(e) => updateBreak(i, { max: Number(e.target.value) || 0 })}
                      style={{ ...inp, width: 90 }}
                    />
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{unit}</span>
                    <Trash2 size={13} style={{ cursor: "pointer", color: "var(--color-danger-icon-strong)", marginLeft: "auto" }} onClick={() => removeBreak(i)} />
                  </div>
                ))}
                <button onClick={addBreak} style={{ ...smallBtn, alignSelf: "flex-start" }}><Plus size={11} /> Add class</button>
                {breakDraftError && <div style={{ fontSize: 10.5, color: "var(--color-danger-icon-strong)" }}>{breakDraftError}</div>}
                <div style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                  Classes are evaluated in order — a sample's colour comes from the first class whose value is ≤ its threshold. A value above every threshold still gets the top class's colour, so nothing above the highest break silently disappears.
                </div>
              </div>
            )}
          </div>

          <button onClick={reset} style={{ ...smallBtn, alignSelf: "flex-start" }}><RotateCcw size={11} /> Reset to default</button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(true), flex: 1 }}>Done</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(460px, 94vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const row = { display: "flex", alignItems: "center", gap: 8 };
const rowLabel = { fontSize: 11.5, color: "#55606e", width: 96, flexShrink: 0 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const colorInp = { width: 34, height: 28, padding: 2, border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", cursor: "pointer", flexShrink: 0 };
const smallBtn = { display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: "1px solid var(--color-border-light)", background: "transparent", color: "#55606e" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid #c7ccd3", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
