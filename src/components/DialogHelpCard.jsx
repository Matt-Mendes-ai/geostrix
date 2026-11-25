// TASKS.csv #4070 (Main, 2026-11-25) — the "?" card of a dialog that had none: one or two short lines (already translated), and a link to the full Help page when one exists.
// It is the `help` node a StepDialog shows under its "?" (a plain block: the dialog's name is already its title); the long explanations stay on the Help page.
import React from "react";
import { t as tr } from "../lib/i18n.js";
import { openHelp } from "../lib/help.js";

export default function DialogHelpCard({ lines, page = null }) {
  return (
    <div data-dialog-help="">
      {lines.map((l, i) => <div key={i} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45, marginBottom: 4 }}>{l}</div>)}
      {page && <button type="button" data-btn-own="" data-dialog-help-page={page} onClick={() => openHelp(page)} style={{ background: "none", border: "none", padding: 0, color: "var(--color-info)", cursor: "pointer", font: "inherit", fontSize: "var(--font-size-sm)" }}>{tr("More")}</button>}
    </div>
  );
}
