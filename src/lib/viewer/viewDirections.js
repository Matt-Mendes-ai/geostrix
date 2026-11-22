// TASKS.csv #4005 (Matt, 2026-11-22) — one-key view directions for the 3D view: T looks down from the top, B up from the bottom, N / S / E / W look
// at the model level from the north / south / east / west SIDE (the camera stands on that side: "from the north"; the compass rose's click looks
// TOWARD the letter instead, #523). The camera is the viewer's spherical one (ViewerModule's updateCamera): position = target + radius * (sin phi * sin
// theta, cos phi, sin phi * cos theta), world north = -z, east = +x (CompassRose). A key changes only theta and phi, so the target and the distance stay.
// Top and Bottom are what the Top / Bottom buttons do (#1200: north up; Bottom keeps the azimuth it had).
export const TOP_PHI = 0.02; // 1.15 deg off straight down: the pole itself has no 'up' (#398, #981)
export const VIEW_DIRECTIONS = {
  t: { theta: 0, phi: TOP_PHI },
  b: { theta: null, phi: Math.PI - TOP_PHI },
  n: { theta: Math.PI, phi: Math.PI / 2 }, // camera on the -z side, looking south
  s: { theta: 0, phi: Math.PI / 2 }, // camera on the +z side, looking north
  e: { theta: Math.PI / 2, phi: Math.PI / 2 }, // camera on the +x side, looking west
  w: { theta: -Math.PI / 2, phi: Math.PI / 2 }, // camera on the -x side, looking east
};
const CODES = { KeyT: "t", KeyB: "b", KeyN: "n", KeyS: "s", KeyE: "e", KeyW: "w" };

// the direction a key press means ("t" ... "w"), or null: a plain letter only (no Ctrl / Alt / Meta, no key repeat). The letter printed on the key decides; on a
// layout that has no Latin letters (Arabic, Cyrillic) the physical key does, so the same six keys work there.
export function viewDirectionKey(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  const k = typeof e.key === "string" ? e.key.toLowerCase() : "";
  if (k.length === 1 && /[a-z]/.test(k)) return VIEW_DIRECTIONS[k] ? k : null;
  return CODES[e.code] || null;
}

const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);
// a field the person is (or may be) typing in: a letter belongs to it
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NOT_TEXT.has(String(el.type || "text").toLowerCase());
  return !!el.isContentEditable;
}

// the direction ("t" ... "w") when the press is for the 3D view, else null. ctx: visible (this 3D view is the tab shown), over (the pointer is over it),
// focusInside (the focus is in it), typing (the key's target or the focused element is a field), modalOpen (a dialog is open).
export function viewDirectionFor(e, ctx) {
  const k = viewDirectionKey(e);
  if (!k || !ctx.visible || ctx.typing || ctx.modalOpen) return null;
  return ctx.over || ctx.focusInside ? k : null;
}

// puts a camera state ({ theta, phi, radius, target }) in that direction; the target and the radius are not touched
export function applyViewDirection(cs, k) {
  const d = VIEW_DIRECTIONS[k];
  if (!cs || !d) return false;
  if (d.theta != null) cs.theta = d.theta;
  cs.phi = d.phi;
  return true;
}
