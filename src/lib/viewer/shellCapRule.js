// TASKS.csv #2222 / #3272 / #3650 — what the grade shell's default cap does when the element, its CV or the holes change.
// symbol: the element shown; auto: { symbol, value } the cap this rule last set (and for which element); capValue: the cap box (NaN = empty);
// over: the element's CV is over the capping rule (150 %). -> "fill" (set the element's P99), "clear" (empty the box) or "keep".
//
// #3650 (Fireweed re-test R1, Macpass) — the pane rendered its first listed element (Ag) before settling on the remembered one (Zn): the box was
// filled with Ag's P99 (209.9) and then taken for a cap the user typed for Zn, and a first pick of Ag afterwards ran uncapped ('set once for this
// element: an emptied field stays empty'). A cap this rule set for ANOTHER element is not the user's: refilled for this one, or cleared. The pane
// also forgets `auto` when the element is changed in its list, so the first pick of an element is never taken for an emptied box.
export function shellCapAction({ symbol, auto, capValue, over }) {
  const own = auto?.symbol === symbol, has = Number.isFinite(capValue) && capValue > 0;
  const mine = own && has && capValue === auto.value;
  const stale = !own && has && auto?.symbol != null && capValue === auto.value; // #3650 — set for another element
  if (!over) return mine || stale ? "clear" : "keep"; // #3272 — the rule no longer holds there
  if (has && !mine && !stale) return "keep"; // a typed cap
  if (own && !has) return "keep"; // set once for this element: an emptied field stays empty
  return "fill";
}
