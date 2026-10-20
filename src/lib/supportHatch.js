// TASKS.csv #535 — "barely seen by the data" cells (support below the cutoff) as a HATCH, not a flat grey. The grey
// #d6d9de sat ΔE00 3.0 from the old resistivity ramp (≈150-200 ohm·m drew the same), so the section's one honesty
// cue could read as a real result; a pattern cannot collide with any ramp colour, in colour, under colour-vision
// deficiency, or in greyscale print. 45° lines over a pale grey; the legend shows the same swatch.
export const HATCH = { bg: "#eef0f3", line: "#6f7782" };

// a CanvasPattern for 2D canvas drawing; `px` = line spacing in canvas pixels
export function canvasHatch(g, px = 7) {
  const t = document.createElement("canvas");
  t.width = t.height = px;
  const c = t.getContext("2d");
  c.fillStyle = HATCH.bg; c.fillRect(0, 0, px, px);
  c.strokeStyle = HATCH.line; c.lineWidth = Math.max(1, px / 6);
  c.beginPath(); c.moveTo(0, px); c.lineTo(px, 0); c.moveTo(-px / 2, px / 2); c.lineTo(px / 2, -px / 2); c.moveTo(px / 2, px * 1.5); c.lineTo(px * 1.5, px / 2); c.stroke();
  return g.createPattern(t, "repeat");
}
