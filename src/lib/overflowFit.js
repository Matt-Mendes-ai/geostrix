// TASKS.csv #4074 — a band that is wider than the window never loses a tool: after every group has given up its labels (Ribbon.jsx fit, #787),
// the groups' last tools move into a "More" menu at the end of their group, and the top bar's last actions into a "⋯" menu. This file is the
// part that decides, kept free of the DOM so a test can run it at any width (test/ribbonOverflow4074.test.mjs); Ribbon.jsx and App.jsx
// give it the measuring and the hiding.

// Which group gives up a tool next: the widest one that still shows two or more (a group keeps at least one tool beside its More button).
// groups: [{ width, visible }]; returns an index, or -1 when no group can give up another.
export function pickOverflowGroup(groups) {
  let best = -1;
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].visible < 2) continue;
    if (best < 0 || groups[i].width > groups[best].width) best = i;
  }
  return best;
}

// Hide tools, one at a time, until the band fits. fits(): the band no longer overflows; groups(): the current [{ width, visible }] (read again after each
// hide, because a hidden tool changes its group's width); hideLast(i): hide group i's last shown tool. Returns { ok, hidden } (hidden: how many tools moved).
export function fitByOverflow({ fits, groups, hideLast, max = 500 }) {
  let hidden = 0;
  while (!fits() && hidden < max) {
    const i = pickOverflowGroup(groups());
    if (i < 0) return { ok: false, hidden };
    hideLast(i);
    hidden++;
  }
  return { ok: fits(), hidden };
}

// The top bar: one run of actions, the last ones go first. visible(): how many actions show; hideLast(): hide the last shown one.
export function fitRowByOverflow({ fits, visible, hideLast, keep = 1, max = 100 }) {
  let hidden = 0;
  while (!fits() && visible() > keep && hidden < max) { hideLast(); hidden++; }
  return { ok: fits(), hidden };
}

// DOM side (shared by Ribbon.jsx and App.jsx): a tool that moved into the menu is marked, and app.css hides it.
export const OVF = "data-ovf";
const shown = (n) => !n.hasAttribute(OVF) && n.offsetWidth > 0; // a slot whose tool Simple mode hides has no width: it is not a tool to hide
export function clearOverflow(container) {
  if (!container) return;
  container.querySelectorAll(`[${OVF}]`).forEach((n) => n.removeAttribute(OVF));
  container.removeAttribute("data-overflow-from");
}
// the tools of a container: its direct children that take room (a separator is not one), in order
export function toolsOf(container) {
  return [...container.children].filter((n) => !n.hasAttribute("data-more-wrap") && !n.hasAttribute("data-sep"));
}
// hide the container's last shown tool; returns the index it had among toolsOf(container), -1 when none was shown
export function hideLastTool(container) {
  const tools = toolsOf(container);
  for (let i = tools.length - 1; i >= 0; i--) {
    if (shown(tools[i])) {
      tools[i].setAttribute(OVF, "");
      container.setAttribute("data-overflow-from", String(i));
      return i;
    }
  }
  return -1;
}
export const shownCount = (container) => toolsOf(container).filter(shown).length;
// a divider only stands between two shown tools: one left at an end of the row (its neighbours went into the menu) is hidden too
export function trimSeparators(container) {
  const kids = [...container.children].filter((n) => !n.hasAttribute("data-more-wrap"));
  const tool = (n) => !n.hasAttribute("data-sep") && !n.hasAttribute(OVF) && n.offsetWidth > 0;
  kids.forEach((n, i) => {
    if (!n.hasAttribute("data-sep")) return;
    const before = kids.slice(0, i).some(tool), after = kids.slice(i + 1).some(tool);
    if (!before || !after) n.setAttribute(OVF, "");
    else n.removeAttribute(OVF);
  });
}
