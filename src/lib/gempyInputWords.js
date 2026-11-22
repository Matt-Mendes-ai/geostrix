// TASKS.csv #3986 — the input check's words (lib/gempyInputCheck.js): what it fixed before the solve, and the likely cause of a singular matrix in
// one line when the solve still fails.
import { notice } from "./notices.js";
import { t as tr } from "./i18n.js";

const names = (list) => { const u = [...new Set(list.map((x) => x.label))]; return u.slice(0, 4).join(", ") + (u.length > 4 ? "…" : ""); };
// the fixes, as one notice
export function inputCheckNotice(f) {
  const parts = [];
  const dupes = f.dupes.reduce((s, x) => s + x.n, 0), shared = f.shared.reduce((s, x) => s + x.n, 0);
  if (dupes) parts.push(tr("{n} repeated point(s) removed ({labels})", { n: dupes, labels: names(f.dupes) }));
  if (f.orientationDupes) parts.push(tr("{n} repeated orientation(s) removed", { n: f.orientationDupes }));
  if (shared) parts.push(tr("{n} point(s) on another surface's removed ({labels})", { n: shared, labels: names(f.shared) }));
  if (f.dropped.length) parts.push(tr("left out with under two points: {labels}", { labels: names(f.dropped) }));
  if (f.borrowed.length) parts.push(tr("given the nearest measured orientation: {labels}", { labels: names(f.borrowed) }));
  return notice("Input check before solving: {list}.", { list: parts.join("; ") });
}
// the likely cause of a singular matrix, from what the check could not fix
export function singularCause(risks) {
  const r = (risks || [])[0];
  if (r?.kind === "close") return tr("points of {a} and {b} lie within a few metres of each other; leave one out or check their contacts", { a: r.other, b: r.label });
  if (r?.kind === "onALine") return tr("the points of {a} lie on one line and give no plane; add an orientation or points off that line", { a: r.label });
  if (r?.kind === "noOrientation") return tr("{a} has no orientation; add a dip measurement near it", { a: r.label });
  return tr("two inputs GemPy cannot tell apart, often faults at the default dip with traces close together; leave out some faults or set their dips");
}
