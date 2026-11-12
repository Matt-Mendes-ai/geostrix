// TASKS.csv #2796 / #2803 — where a click in the 3D view really was. A click event's clientX / clientY are whole pixels; the pointer events'
// (and so the hover tooltip's) keep fractions of a pixel on a scaled display, and a thin far-off tube can lie between the two: Identify
// answered 'Nothing here' where the tooltip showed an interval. The press's position is used when it is the same click.

// e: the click; down: { x, y } of the pointerdown (or null) -> { x, y } in client pixels
export function clickPoint(e, down) {
  if (down && Math.abs(down.x - e.clientX) < 1 && Math.abs(down.y - e.clientY) < 1) return { x: down.x, y: down.y };
  return { x: e.clientX, y: e.clientY };
}

// the click's normalized device coordinates in `rect` (the view's bounding box), for Raycaster.setFromCamera
export function viewNdc(e, rect, down) {
  const p = clickPoint(e, down);
  return { x: ((p.x - rect.left) / rect.width) * 2 - 1, y: -((p.y - rect.top) / rect.height) * 2 + 1 };
}
