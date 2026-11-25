// TASKS.csv #4073 — one shell for every pop-up that is really a short job: the georeferencing dialog of #4071 was restyled as steps and Matt asked for the same everywhere
// ("I like the way the cross section pop up window was restyled. We should do similar for all pop up windows"). It is StepPane's idea (#4070, components/StepPane.jsx:
// a step bar, one question per step, Back / Next and one gold primary, a Result step) in a dialog:
//   - the step bar: numbered circles joined by a line, the current one gold like StepPane's pill; a finished step opens again (going back deletes nothing);
//   - ONE step on screen (only its body is mounted); a dialog that is one screen passes one step: no bar, Cancel and the primary;
//   - the footer: Back (Cancel on the first step) and the ONE gold primary (.gs-btn--primary, #4069): its label and its action belong to the step; with no
//     action it goes to the next step. The last step is the check / Result: its primary is the thing the dialog is for (Place, Import, Run);
//   - a Help-card slot: the header's "?" opens it, so the long explanations live there. Pass the card's content as a <details open> with a <summary> title: the word count reads a <details> body as folded (#3939);
//   - a hint (one short sentence saying what is missing, or what to do) and an error, both shown under the step.
// The parts are exported too, with the shared styles, so a dialog that cannot be steps yet looks like the same family.
// steps: [{ key, label, render: () => node, primary: { label, onClick?, disabled? }, hint?: string }] (labels already translated); at / onAt: the step index, owned by the dialog
// (it needs to know it); panelStyle: extra panel styles merged last (a resizable dialog); help: node | null (a <details open>); error: string | null; title: the dialog's name; extra: header controls before the Help button.
import React from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";

export const stepDialogStyles = {
  body: { padding: 16, overflow: "auto", display: "flex", gap: 16, flex: 1, flexWrap: "wrap", minHeight: 360 },
  label: { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" },
  note: { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 },
  warn: { padding: "6px 10px", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" },
  error: { padding: "8px 10px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-danger-text)" },
  input: { width: "100%", boxSizing: "border-box", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-base)" },
};
const S = stepDialogStyles;

// the step bar: circles 1..n joined by a line; labels are the steps' names
export function StepBar({ steps, at, onAt, label }) {
  return (
    <div role="list" aria-label={label} style={{ display: "flex", padding: "10px 16px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}>
      {steps.map((s, i) => {
        const on = i === at, done = i < at;
        return (
          <div key={s.key} role="listitem" aria-current={on ? "step" : undefined} style={{ flex: i < steps.length - 1 ? 1 : "none", display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-base)", color: on ? "var(--color-text)" : "var(--color-text-muted)", fontWeight: on ? 600 : 400 }}>
            <span onClick={done ? () => onAt(i) : undefined} style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "var(--font-size-sm)", cursor: done ? "pointer" : "default",
              background: on ? "var(--btn-primary-bg)" : "var(--color-bg)", color: on ? "var(--btn-primary-text)" : done ? "var(--color-success-fg)" : "var(--color-text-muted)",
              border: `${on ? 2 : 1}px solid ${on ? "var(--btn-primary-border)" : done ? "var(--color-success-fg)" : "var(--color-border-light)"}` }}>{done ? "✓" : i + 1}</span>
            {s.label}{i < steps.length - 1 && <span style={{ flex: 1, height: 1, background: "var(--color-border-light)", marginInlineStart: 6 }} />}
          </div>
        );
      })}
    </div>
  );
}

export default function StepDialog({ title, onClose, steps, at, onAt, help = null, error = null, extra = null, width = "min(1120px, 96vw)", panelStyle = null }) {
  const [helpOpen, setHelpOpen] = React.useState(false);
  useEscapeKey(() => (helpOpen ? setHelpOpen(false) : onClose()));
  useFocusTrap();
  const i = Math.max(0, Math.min(steps.length - 1, at)), step = steps[i], one = steps.length === 1;
  const p = step.primary || {};
  const reserveHint = steps.some((s) => "hint" in s); // a dialog with a hint keeps its slot, so the dialog does not change height as the hint comes and goes
  const go = () => { if (p.onClick) p.onClick(); else onAt(Math.min(steps.length - 1, i + 1)); };
  return (
    <div style={overlay}>
      <div style={{ width, maxHeight: "92vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", ...panelStyle }}
        role="dialog" aria-modal="true" aria-label={title} data-step-dialog data-step={step.key} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{title}</div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {extra}
            {help && <button type="button" className="gs-btn gs-btn--icon" aria-label={tr("Help")} aria-pressed={helpOpen} onClick={() => setHelpOpen((h) => !h)}>?</button>}
            <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
          </div>
        </div>
        {help && helpOpen && (
          <div role="note" style={{ position: "absolute", insetInlineEnd: 16, top: 54, width: 420, maxWidth: "calc(100% - 32px)", zIndex: 5, background: "var(--color-bg)", border: "1px solid var(--color-border-light)", borderRadius: 10, padding: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", gap: 4 }}>
            {help}
          </div>
        )}
        {!one && <StepBar steps={steps} at={i} onAt={onAt} label={title} />}
        <div style={S.body} data-step-body={step.key}>
          {step.render()}
        </div>
        {(reserveHint || step.hint || error) && (
          <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6, minHeight: reserveHint ? 36 : undefined }}>
            {step.hint && <div role="status" style={S.warn}>{step.hint}</div>}
            {error && <div role="alert" style={S.error}>{error}</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          {i > 0 ? <button type="button" className="gs-btn" style={{ flex: 1 }} onClick={() => onAt(i - 1)}>{tr("Back")}</button> : <button type="button" className="gs-btn" style={{ flex: 1 }} onClick={onClose}>{tr("Cancel")}</button>}
          <button type="button" className="gs-btn gs-btn--primary" style={{ flex: 2 }} disabled={!!p.disabled} onClick={go}>{p.label}</button>
        </div>
      </div>
    </div>
  );
}
