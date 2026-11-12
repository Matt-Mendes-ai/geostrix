// TASKS.csv #2584 (Matt's decision, 2026-11-11) — where the ground between the collars stands in for a terrain, a pit's benches put
// collars of different levels side by side; collarGround (lib/pitShell.js collarBenches) then uses the lowest collar there and leaves
// the higher ones out. Every tool that uses that ground says so here, with the check's own thresholds, never silently.
import React, { useMemo } from "react";
import { collarBenches } from "../lib/pitShell.js";
import { t as tr } from "../lib/i18n.js";

export function collarLevelsText(collars) {
  const b = collarBenches(collars);
  const n = b.higher.length;
  if (!n) return null;
  const args = { n, plan: b.planM, rl: b.rlM };
  return n === 1
    ? tr("1 collar has another collar within {plan} m in plan that is more than {rl} m lower (a pit or benches?): the ground between the collars uses the lower collar there and leaves this one out. A check by those two distances, not a survey: on a steep hillside it lowers real ground too. Load a terrain for the real surface.", args)
    : tr("{n} collars have another collar within {plan} m in plan that is more than {rl} m lower (a pit or benches?): the ground between the collars uses the lowest collar there and leaves these {n} out. A check by those two distances, not a survey: on a steep hillside it lowers real ground too. Load a terrain for the real surface.", args);
}

export default function CollarLevelsNote({ collars, style = null }) {
  const text = useMemo(() => collarLevelsText(collars), [collars]);
  if (!text) return null;
  return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4, marginTop: 4, ...(style || {}) }}>{text}</div>;
}
