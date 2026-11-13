// TASKS.csv #2449 (review #2325, WA uranium) — a LINE or GRID of planned holes in one go: an infill line of five vertical aircore holes was
// five full passes through the add form. A start point, a bearing (grid, clockwise from north), a hole spacing and a count; optionally a
// number of lines and a line spacing, the lines stepping to the RIGHT of the bearing. Names are a prefix and a running number. Pure.
export const MAX_PATTERN_HOLES = 500;

// -> { holes: [{ name, x, y, line, station }], error: null } or { holes: [], error: "inputs" | "too-many" }
export function holePattern({ x, y, bearingDeg, spacing, count, lineSpacing = null, lineCount = 1, prefix = "PLAN-", firstNumber = 1 }) {
  const fin = Number.isFinite;
  const nL = lineCount == null || lineCount === "" ? 1 : Math.round(Number(lineCount));
  const n = Math.round(Number(count));
  if (![x, y, bearingDeg, spacing].every((v) => fin(Number(v))) || !(Number(spacing) > 0) || !(n >= 1) || !(nL >= 1)) return { holes: [], error: "inputs" };
  if (nL > 1 && !(Number(lineSpacing) > 0)) return { holes: [], error: "inputs" };
  if (n * nL > MAX_PATTERN_HOLES) return { holes: [], error: "too-many" };
  const b = (Number(bearingDeg) * Math.PI) / 180, ux = Math.sin(b), uy = Math.cos(b); // along the line
  const rx = Math.cos(b), ry = -Math.sin(b); // to the right of the bearing
  const total = n * nL, width = Math.max(2, String(Number(firstNumber) + total - 1).length), holes = []; // at least 2 digits (#2978 (3): 'STEP-1' beside 'INF-01')
  let k = 0;
  for (let l = 0; l < nL; l++) for (let i = 0; i < n; i++) {
    const px = Number(x) + i * Number(spacing) * ux + l * (Number(lineSpacing) || 0) * rx, py = Number(y) + i * Number(spacing) * uy + l * (Number(lineSpacing) || 0) * ry;
    holes.push({ name: `${prefix}${String(Number(firstNumber) + k).padStart(width, "0")}`, x: Math.round(px * 100) / 100, y: Math.round(py * 100) / 100, line: l + 1, station: i + 1 });
    k++;
  }
  return { holes, error: null };
}

// the first number free after the planned holes already named prefix + digits
export function nextPatternNumber(planned, prefix) {
  let max = 0;
  const esc = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), re = new RegExp(`^${esc}(\\d+)$`);
  for (const h of planned || []) { const m = re.exec(String(h?.name || "")); if (m) max = Math.max(max, Number(m[1])); }
  return max + 1;
}
