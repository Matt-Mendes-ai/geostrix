// TASKS.csv #3537 (Fireweed rehearsal) — the 3D View's notice toast is centred at the top, up to 70 % of the view's width; the Identify panel is
// docked at the top right. A long, sticky toast (the sample's density warning) ran under the panel, which covered its close button. While the
// panel is open the toast keeps to the space left of it, centred there. The panel's place is defined here once, for both.
export const IDENTIFY_PANEL = { top: 12, right: 132, width: 300 };
const CLEAR_RIGHT = IDENTIFY_PANEL.right + IDENTIFY_PANEL.width + 12; // the panel's left edge, from the view's right, and a gap

export function toastBoxStyle(identifyOpen) {
  if (!identifyOpen) return { position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", maxWidth: "70%", pointerEvents: "none" };
  // never wider than the view's left half on a narrow window (min()), where the panel takes most of the width anyway
  return { position: "absolute", top: 12, left: 12, right: `min(${CLEAR_RIGHT}px, 50%)`, display: "flex", justifyContent: "center", pointerEvents: "none" };
}
