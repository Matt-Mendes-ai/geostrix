// TASKS.csv #3887 — the First steps guide in the Help pane: one screen at a time (a diagram, a few lines, one button that opens the real
// thing), Back / Next, and the screen number. The screens are src/help/guide.js; every string goes through tr() (the guide is translated).
// The buttons reuse the app's own routes: a menu action goes through the same window event as a menu item with a user gesture
// (desktop.js onMenu), so it does exactly what the menu does; the start dialogs and the Model button's guided tools are module actions.
import React, { useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { requestModuleAction } from "../lib/menuRequests.js";
import { MACPASS_CREDIT } from "../lib/sampleCredits.js";
import { DIAGRAMS } from "./diagrams/index.jsx";
import { FIRST_STEPS } from "./guide.js";

const menu = (action) => { try { window.dispatchEvent(new CustomEvent("geostrix-menu-gesture", { detail: action })); } catch { /* no window */ } };
export function runGuideAction(act) {
  if (act === "start") requestModuleAction("open-start-dialog");
  else if (act === "guided") { menu("module-viewer"); requestModuleAction("guided-open", { tool: "start" }); }
  else menu(act);
}


export default function FirstSteps() {
  const [i, setI] = useState(0);
  const s = FIRST_STEPS[i], D = DIAGRAMS[s.diagram], n = FIRST_STEPS.length;
  return (
    <section data-first-steps={i + 1} aria-roledescription={tr("Guide")} style={{ marginTop: 8 }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Screen {i} of {n}", { i: i + 1, n })}</div>
      <h3 style={{ margin: "2px 0 6px", fontSize: "var(--font-size-lg)" }}>{tr(s.title)}</h3>
      {D && <figure role="img" aria-label={tr(s.alt)} style={{ margin: "0 0 8px" }}><D /></figure>}
      <p style={{ margin: "0 0 8px", lineHeight: 1.45 }}>{tr(s.text)}</p>
      {s.button && <button className="gs-btn gs-btn--primary" type="button" data-guide-act={s.button.act} onClick={() => runGuideAction(s.button.act)}>{tr(s.button.label)}</button>}
      {s.credit === "macpass" && <div data-guide-credit="" lang="en" dir="auto" style={{ marginTop: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{MACPASS_CREDIT}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <button className="gs-btn" type="button" disabled={i === 0} onClick={() => setI(i - 1)}>{tr("Back")}</button>
        <span aria-hidden="true" style={{ display: "flex", gap: 4 }}>{FIRST_STEPS.map((_, k) => <span key={k} style={{ width: 7, height: 7, borderRadius: "50%", background: k === i ? "var(--color-accent)" : "var(--color-border)" }} />)}</span>
        <button className="gs-btn" type="button" disabled={i === n - 1} onClick={() => setI(i + 1)}>{tr("Next")}</button>
      </div>
    </section>
  );
}
