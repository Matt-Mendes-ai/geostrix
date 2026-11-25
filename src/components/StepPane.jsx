// TASKS.csv #4070 — a 3D Modelling pane as steps, like the Guide (Matt's layout C, 2026-11-24: "steps, like the Guide"). One shell for every pane:
//   - a step bar (numbered pills; any pill opens its step, going back deletes nothing);
//   - one question per step, its answer already filled in from the data by the pane;
//   - Back / Next, and on the action step the pane's main action as its one gold primary (#4069);
//   - a Result step, in numbers, that opens by itself when a run lands (result.key changes) and is greyed until then;
//   - the Fine-tune drawer: every other setting, passed in as a closed <MoreFold summary="Fine-tune…"> so the word count reads it as folded (#3939);
//   - the pane header's "?" opens Help (TaskPaneHeader), so the long explanations live there.
// A short pane is one step: no bar, no Back / Next. The step a pane is on is kept for the session (per pane id), so closing and reopening it returns there.
import React, { useEffect, useRef, useState } from "react";
import { t as tr } from "../lib/i18n.js";

import { requestStep, takeStep, STEP_EVENT } from "../lib/stepRequest.js"; // a step asked for from outside the pane (lib/stepRequest.js)
export { requestStep };

const kept = new Map(); // pane id -> step index (this session)

const muted = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" };

// steps: [{ key, label, question, body, hint }] (label and question already translated); action: { label, onClick, disabled, title, icon, step, attrs } (step: the index it sits on, default the last; attrs: extra attributes, e.g. data-mcp);
// result: { key, body, label, offTitle } (key: what changes when a new result lands, null before any; label: the Result step's name, default "Result"; offTitle: the tooltip of the greyed pill, default "After the first run"); fineTune: a node (a closed MoreFold);
// label: the pane's name (translated); start: the step a pane opens on the first time ("result" for a pane whose last step is the list the user opens it for; default the first);
// message: what the last action said (an import's note, an error), shown under the step bar inside the step rather than above the bar, so a long one does not push
// the steps down (TASKS.csv #4070, side 2; StepDialog's hint / error slot for panes): a node, a string (a note), or { text, level: "error" | "warn" | "info" }
export default function StepPane({ id, label, steps, action, result, fineTune, top, start = 0, message = null }) {
  const resultLabel = result?.label || tr("Result");
  const all = result ? [...steps, { key: "result", label: resultLabel, body: result.body }] : steps;
  const last = all.length - 1;
  const [at, setAtState] = useState(() => Math.min(kept.get(id) ?? (start === "result" ? last : start), last));
  const setAt = (i) => { const k = Math.max(0, Math.min(last, i)); kept.set(id, k); setAtState(k); };
  // a new result opens the Result step (not the one there when the pane opened)
  const seen = useRef(result?.key ?? null);
  useEffect(() => {
    const k = result?.key ?? null;
    if (k != null && k !== seen.current) setAt(last);
    seen.current = k;
  }, [result?.key]); // only a new result moves the pane
  const keys = all.map((s) => s.key).join("|");
  useEffect(() => {
    const take = () => { const k = takeStep(id); const i = k == null ? -1 : keys.split("|").indexOf(k); if (i >= 0) setAt(i); };
    take();
    const on = (e) => { if (e.detail?.id === id) take(); };
    window.addEventListener(STEP_EVENT, on);
    return () => window.removeEventListener(STEP_EVENT, on);
  }, [id, keys]);
  const step = all[Math.min(at, last)];
  const onResult = result && at === last;
  const resultReady = !!(result && result.key != null);
  const actionAt = action ? (action.step ?? steps.length - 1) : -1;
  const one = all.length === 1;
  return (
    <div className="gs-steps" data-step-pane={id} data-step={step.key}>
      {top}
      {!one && (
        <div role="tablist" aria-label={label} style={{ display: "flex", gap: 4, margin: "2px 0 8px" }}>
          {all.map((s, i) => {
            const isResult = result && i === last, off = isResult && !resultReady, on = i === at;
            return (
              <button key={s.key} type="button" role="tab" aria-selected={on} disabled={off} onClick={() => setAt(i)} data-btn-own=""
                title={off ? result.offTitle || tr("After the first run") : s.label} aria-label={`${i + 1}. ${s.label}`}
                style={{ flex: 1, minWidth: 0, height: 24, borderRadius: 12, cursor: off ? "default" : "pointer", fontSize: "var(--font-size-xs)", fontWeight: 600, padding: "0 4px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  border: `${on ? 2 : 1}px solid ${on ? "var(--btn-primary-border)" : "var(--color-border)"}`,
                  background: on ? "var(--btn-primary-bg)" : off ? "var(--color-bg-subtle)" : "var(--color-bg)",
                  color: on ? "var(--btn-primary-text)" : off ? "var(--color-text-faint)" : "var(--color-text-secondary)" }}>
                {on ? `${i + 1} ${s.label}` : i + 1}
              </button>
            );
          })}
        </div>
      )}
      {message != null && message !== "" && message !== false && <StepMessage message={message} />}
      {/* every step stays mounted, only the shown one visible: a step's parts that set a value when they mount (the Grade shell's automatic cap,
          ShellCapNote) do so whichever step is open, as they did in the one long pane */}
      {all.map((s, i) => (
        <div key={s.key} data-step-body={s.key} hidden={i !== at}>
          {s.question && <div style={{ fontWeight: 600, marginBottom: 6 }} title={s.hint || undefined}>{s.question}</div>}
          {s.body}
        </div>
      ))}
      {action && at === actionAt && (
        <button type="button" className="gs-btn gs-btn--primary gs-btn--block" {...(action.attrs || {})} onClick={action.onClick} disabled={action.disabled} title={action.title} style={{ marginTop: 8, justifyContent: "center" }}>
          {action.icon}{action.label}
        </button>
      )}
      {!one && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, margin: "8px 0" }}>
          <button type="button" className="gs-btn gs-btn--sm" onClick={() => setAt(onResult ? 0 : at - 1)} disabled={at === 0} style={at === 0 ? { visibility: "hidden" } : undefined}>
            {onResult ? tr("Change") : tr("Back")}
          </button>
          {at < last && !(result && at + 1 === last && !resultReady) && at !== actionAt && (
            <button type="button" className="gs-btn gs-btn--sm" onClick={() => setAt(at + 1)}>{tr("Next")}</button>
          )}
          {at === actionAt && resultReady && <button type="button" className="gs-btn gs-btn--sm gs-btn--quiet" onClick={() => setAt(last)}>{resultLabel}</button>}
        </div>
      )}
      {fineTune}
    </div>
  );
}

// a row of choices as radio cards (a step's answer): options [{ value, label, sub, title, disabled }]
export function StepChoices({ value, options, onChange, label, columns = 1 }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)} data-btn-own=""
            style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, textAlign: "start", padding: "5px 8px", borderRadius: 6, cursor: o.disabled ? "default" : "pointer",
              background: on ? "var(--color-bg-subtle)" : "var(--color-bg)", color: o.disabled ? "var(--color-text-faint)" : "var(--color-text)", fontSize: "var(--font-size-sm)",
              border: `${on ? 2 : 1}px solid ${on ? "var(--btn-primary-border)" : "var(--color-border)"}`, minWidth: 0 }}>
            <span style={{ fontWeight: on ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
            {o.sub != null && <span style={{ ...muted, flexShrink: 0 }}>{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

// a Result step's numbers: rows [{ label, value, level }] (level: "high" red, "some" amber, "muted" grey and light: a figure the pane says not to lean on)
export function StepNumbers({ rows }) {
  const colour = { high: "var(--color-danger-text)", some: "var(--color-warn-text-strong)", muted: "var(--color-text-muted)" };
  return (
    <div role="table" style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 10, rowGap: 3, fontSize: "var(--font-size-sm)", marginBottom: 6 }}>
      {rows.filter(Boolean).map((r) => (
        <React.Fragment key={r.label}>
          <span role="rowheader" style={{ color: "var(--color-text-secondary)" }} title={r.title}>{r.label}</span>
          <span role="cell" style={{ fontWeight: r.level === "muted" ? 400 : 600, textAlign: "end", color: colour[r.level] || "var(--color-text)" }}>{r.value}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// the message slot's look: a plain string is a note; { text, level } takes StepDialog's error / warn colours, or the info box
const MESSAGE_LOOK = {
  error: { role: "alert", style: { background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", color: "var(--color-danger-text)" } },
  warn: { role: "status", style: { background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", color: "var(--color-warn-text)" } },
  info: { role: "status", style: { background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" } },
};
function StepMessage({ message }) {
  if (React.isValidElement(message) || Array.isArray(message)) return <div data-step-message="" style={{ marginBottom: 8 }}>{message}</div>;
  const m = typeof message === "string" ? { text: message, level: "info" } : message;
  const look = MESSAGE_LOOK[m.level] || MESSAGE_LOOK.info;
  return <div data-step-message="" role={look.role} style={{ padding: "6px 9px", borderRadius: 6, fontSize: "var(--font-size-sm)", lineHeight: 1.45, marginBottom: 8, ...look.style }}>{m.text}</div>;
}
