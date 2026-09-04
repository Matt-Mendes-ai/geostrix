// TASKS.csv #296 — keyboard-reachable icon controls.
//
// A UX/accessibility review found ~39 icon-only controls in ViewerModule.jsx (delete/zoom/rename/
// filter/collapse icons on every layer, section, theme, surface, domain and planned-hole row) that
// were bare lucide SVGs with `onClick` hung directly on them. That's worse than an unlabeled
// button: an <svg> with an onClick handler is not focusable and has no role, so a keyboard-only
// user cannot reach those controls AT ALL — no amount of aria-label would have helped until they
// became real interactive elements first.
//
// This spreads the four things such a control needs, matching the pattern already used by
// App.jsx's project-tab close control (role="button" + tabIndex={0} + aria-label + an Enter/Space
// onKeyDown) rather than inventing a second one. It's a helper instead of ~39 copies of that
// block purely because of the repetition count; the resulting DOM is identical.
//
// `label` does double duty as the accessible name and the mouse tooltip, so the two can't drift
// apart — which is exactly how they HAD drifted (a good hover tooltip, no accessible name at all)
// in the sibling finding, TASKS.csv #297.
//
// Usage: <Trash2 size={12} style={…} {...iconAction(() => removeRaster(r.id), `Remove raster "${r.name}"`)} />
export function iconAction(onActivate, label) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    title: label,
    onClick: onActivate,
    // Enter and Space are what a real <button> responds to, so a role="button" element has to
    // implement both itself. preventDefault stops Space from scrolling the panel; stopPropagation
    // matters because most of these icons sit inside a row that has its own onClick (toggle
    // visibility, expand/collapse) which must not also fire.
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onActivate(e);
      }
    },
  };
}
