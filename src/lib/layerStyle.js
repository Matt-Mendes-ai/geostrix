// TASKS.csv #635 — per-layer 3D style (Matt: "the option to edit the styles of each layer, colour, size, type
// (circle, plane, cylinder), etc"). A style is a small override saved in the project's view state
// (viewerUiState.layerStyles[key]); anything not set falls back to the layer's built-in look, so an untouched
// project draws exactly as before. Keys: an interval / point / structure layer's key ("litho", "mnlgy",
// "structure"…), or "custom:<id>" for a custom layer.
//   size     multiplier of the default size (1 = default)
//   opacity  0.1–1 (absent = the layer's default)
//   shape    one of SHAPES[kind] (absent = the first, the default)
//   color    "#rrggbb" = one colour for the whole layer; absent = the layer's category / value colours

export const SHAPES = {
  interval: [
    { id: "cylinder", label: "Cylinder (6 sides)" },
    { id: "smooth", label: "Smooth cylinder" },
    { id: "square", label: "Square prism" },
  ],
  point: [
    { id: "sphere", label: "Sphere" },
    { id: "cube", label: "Cube" },
    { id: "disc", label: "Flat disc" },
    { id: "pillar", label: "Cylinder" },
  ],
  plane: [
    { id: "disc", label: "Disc" },
    { id: "square", label: "Square plane" },
  ],
};

// radial segments for a curved interval (TubeGeometry) in each interval shape
export const TUBE_SEGMENTS = { cylinder: 6, smooth: 16, square: 4 };

export const SIZE_MIN = 0.2, SIZE_MAX = 6;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

// The effective style for one layer: kind = "interval" | "point" | "plane"; defaults = { opacity }.
export function resolveLayerStyle(style, kind, defaults = {}) {
  const s = style || {};
  const shapes = SHAPES[kind] || SHAPES.point;
  const size = Number.isFinite(s.size) && s.size > 0 ? clamp(s.size, SIZE_MIN, SIZE_MAX) : 1;
  const opacity = Number.isFinite(s.opacity) ? clamp(s.opacity, 0.1, 1) : (defaults.opacity ?? 1);
  const shape = shapes.some((x) => x.id === s.shape) ? s.shape : shapes[0].id;
  return { size, opacity, shape, color: isHex(s.color) ? s.color.toLowerCase() : null };
}

// Drops defaults so saved projects only carry what the user changed; null when nothing is left.
export function cleanLayerStyle(style, kind) {
  const s = style || {}, out = {};
  if (Number.isFinite(s.size) && Math.abs(s.size - 1) > 1e-9) out.size = clamp(s.size, SIZE_MIN, SIZE_MAX);
  if (Number.isFinite(s.opacity)) out.opacity = clamp(s.opacity, 0.1, 1);
  const shapes = SHAPES[kind] || SHAPES.point;
  if (s.shape && s.shape !== shapes[0].id && shapes.some((x) => x.id === s.shape)) out.shape = s.shape;
  if (isHex(s.color)) out.color = s.color.toLowerCase();
  return Object.keys(out).length ? out : null;
}

// A short "what's changed" summary for menus / tooltips, e.g. "Cube · ×2 · 60% · one colour".
export function describeLayerStyle(style, kind) {
  const c = cleanLayerStyle(style, kind);
  if (!c) return "";
  const parts = [];
  if (c.shape) parts.push((SHAPES[kind] || []).find((x) => x.id === c.shape)?.label || c.shape);
  if (c.size) parts.push(`×${+c.size.toFixed(2)}`);
  if (c.opacity != null) parts.push(`${Math.round(c.opacity * 100)}%`);
  if (c.color) parts.push("one colour");
  return parts.join(" · ");
}
