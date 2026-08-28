import React, { useState } from "react";
import { X, Plus, Trash2, RotateCcw } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";

// User request: "I wanna be able to change the assay legend. Change colour, size, recategorize,
// ignore values lower than (what the user specifies)". Per-element styling for the 3D View / cross-
// section assay markers — previously each toggled-on element got a hardcoded fixed hue and a
// continuous 1.2-3.8 size range with no way to touch either, and every sample rendered regardless of
// grade. This modal edits one element's entry in ViewerModule's `assayStyle` state:
//   { color: "#rrggbb" | null, sizeMult: number, minCutoff: number | null, breaks: [{max,color,label}] }
// `onChange` is called with the full next style object on every edit (ViewerModule owns the actual
// state and re-renders the 3D scene from it); this component is otherwise stateless about what's
// already been applied, just a plain controlled editor over the `style` prop.
export default function AssayStyleModal({ symbol, unit, defaultColor, range, style, onChange, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
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
      const { min, max } = range;
      const span = max - min;
      const seeded = span > 0
        ? [
            { max: +(min + span / 3).toFixed(3), color: "#5a6472", label: "Low" },
            { max: +(min + (2 * span) / 3).toFixed(3), color: "#e2a63c", label: "Medium" },
            { max: +max.toFixed(3), color: "#e05a4a", label: "High" },
          ]
        : [{ max: max || 1, color: "#e05a4a", label: "All" }];
      commit({ ...local, breaks: seeded });
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
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Style {symbol}</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>Data range: {range.min} – {range.max} {unit}</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
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
            <span style={{ fontSize: 11, color: "#55606e", width: 34, textAlign: "right" }}>{local.sizeMult.toFixed(1)}×</span>
          </label>

          <label style={row}>
            <span style={rowLabel} title="Samples below this grade aren't drawn at all — declutters low/background values.">Ignore below</span>
            <input type="number" step="any" placeholder="none" value={local.minCutoff} onChange={(e) => commit({ ...local, minCutoff: e.target.value })} style={{ ...inp, width: 100 }} />
            <span style={{ fontSize: 11, color: "#94a1b0" }}>{unit}</span>
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
                    <span style={{ fontSize: 11, color: "#94a1b0" }}>≤</span>
                    <input
                      type="number" step="any"
                      value={b.max}
                      onChange={(e) => updateBreak(i, { max: Number(e.target.value) || 0 })}
                      style={{ ...inp, width: 90 }}
                    />
                    <span style={{ fontSize: 11, color: "#94a1b0" }}>{unit}</span>
                    <Trash2 size={13} style={{ cursor: "pointer", color: "#a95555", marginLeft: "auto" }} onClick={() => removeBreak(i)} />
                  </div>
                ))}
                <button onClick={addBreak} style={{ ...smallBtn, alignSelf: "flex-start" }}><Plus size={11} /> Add class</button>
                {breakDraftError && <div style={{ fontSize: 10.5, color: "#a95555" }}>{breakDraftError}</div>}
                <div style={{ fontSize: 10, color: "#94a1b0", lineHeight: 1.5 }}>
                  Classes are evaluated in order — a sample's colour comes from the first class whose value is ≤ its threshold. A value above every threshold still gets the top class's colour, so nothing above the highest break silently disappears.
                </div>
              </div>
            )}
          </div>

          <button onClick={reset} style={{ ...smallBtn, alignSelf: "flex-start" }}><RotateCcw size={11} /> Reset to default</button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(true), flex: 1 }}>Done</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(460px, 94vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const row = { display: "flex", alignItems: "center", gap: 8 };
const rowLabel = { fontSize: 11.5, color: "#55606e", width: 96, flexShrink: 0 };
const inp = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const colorInp = { width: 34, height: 28, padding: 2, border: "1px solid #d9dce1", borderRadius: 5, background: "#ffffff", cursor: "pointer", flexShrink: 0 };
const smallBtn = { display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: "1px solid #c7ccd3", background: "transparent", color: "#55606e" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
