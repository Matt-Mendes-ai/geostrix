// TASKS.csv #1743 / #1846 — Surface query's Point tab measured from (0, 0, 0) with the boxes empty ('Distance to surface: 5968330.073 m'):
// Number("") is 0. A blank (or non-numeric) box is a missing coordinate: no point until all three are typed.
export function pointFromInputs(x, y, z) {
  const v = [x, y, z].map((s) => (String(s ?? "").trim() === "" ? NaN : Number(s)));
  return v.every(Number.isFinite) ? { x: v[0], y: v[1], z: v[2] } : null;
}
