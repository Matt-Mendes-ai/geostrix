// TASKS.csv #3555 (Fireweed rehearsal, Macpass) — a project saved with a hole filter reopened with nothing saying that 416 of 559 holes were
// hidden ('Holes: 559' in the status bar, the one line that explains it below the fold of the sidebar). A quiet line over the view while any
// hole is unchecked: how many are shown, and a button that shows them all.
import { t as tr } from "../../lib/i18n.js";
import { hiddenHoleCount } from "../../lib/holeFilter.js";


export default function HiddenHolesNote({ collars, visibleHoles, setVisibleHoles }) {
  const total = collars?.length || 0, hidden = hiddenHoleCount(collars, visibleHoles);
  if (!hidden || hidden >= total + 1) return null;
  return (
    <div role="status" style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", background: "var(--color-bg)", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--color-border)", maxWidth: "70%" }}>
      <span>{tr("{shown} of {total} holes shown", { shown: (total - hidden).toLocaleString(), total: total.toLocaleString() })}</span>
      <button data-btn-own="" type="button" onClick={() => setVisibleHoles({})} style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0, fontSize: "inherit", textDecoration: "underline" }}>{tr("Show all")}</button>
    </div>
  );
}
