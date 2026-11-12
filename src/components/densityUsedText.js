// TASKS.csv #2647 — the line under a pit result that weighed its blocks by code: which density each code's blocks took, and how many took
// the pane's density (no code within reach, or no density typed for it). densityUsed: { layer, used: [{ code, n, rho }] } (lib/densityByCode.js)
import { t as tr } from "../lib/i18n.js";

const LAYER = { weath: "Weathering", litho: "Lithology", alt: "Alteration" };
export function densityUsedText({ layer, used, untyped = null }) {
  const coded = (used || []).filter((u) => u.code != null), rest = (used || []).find((u) => u.code == null)?.n || 0;
  const list = coded.slice(0, 8).map((u) => tr("{code} {rho} t/m³ ({n} blocks)", { code: u.code, rho: u.rho, n: u.n.toLocaleString() })).join(", ") + (coded.length > 8 ? ", …" : "");
  // TASKS.csv #2993 — which of the other blocks had a code with no density typed (the rest had no code within reach)
  const un = (untyped || []).filter((u) => u.n > 0);
  const unText = un.length ? " " + tr("Codes with no density typed: {list}.", { list: un.slice(0, 8).map((u) => tr("{code} ({n} blocks)", { code: u.code, n: u.n.toLocaleString() })).join(", ") + (un.length > 8 ? ", …" : "") }) : "";
  return (rest
    ? tr("Density by {layer}: {list}; {n} other blocks took the density above.", { layer: tr(LAYER[layer] || layer), list: list || "—", n: rest.toLocaleString() })
    : tr("Density by {layer}: {list}.", { layer: tr(LAYER[layer] || layer), list })) + unText;
}
