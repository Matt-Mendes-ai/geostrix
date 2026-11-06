// TASKS.csv #1378 (review #1352, Silvertip) — a generated surface's 'Parameters used' printed its stored keys as labels ('Gempy C O 10',
// 'Engine Dtype float32') and the model box in the solve frame ('Extent [-846,1098,-738,916,-1560,189]': offsets from the scene
// origin, not project coordinates). The rows now carry readable labels, and the extent is given in project coordinates when the run
// stored its origin (extentOrigin, from this change on) and no trend warp applies; otherwise it says which frame it is in.
// -> [{ key, label, text }] with English labels (the caller translates them); pure, no React.
const LABELS = {
  gempyCO: "GemPy covariance at lag zero (c_o)", gempyRange: "GemPy potential-field range", gempyRangeDefault: "GemPy default range",
  gempyRangeMultiplier: "Range multiplier", engineDtype: "Engine precision", surfaceDetail: "Surface detail (octree level)",
  sourcePoints: "Contact points", orientations: "Orientations", relation: "Unit relationship", resolution: "Model grid (cells)",
};
const SKIP = new Set(["generatedAt", "builtAt", "importedAt", "extentOrigin"]);
const PRECISION = { float32: "single (float32)", float64: "double (float64)" };
const keyLabel = (k) => LABELS[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const valueText = (v) => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(3)) : typeof v === "object" ? JSON.stringify(v) : String(v));

export function extentText(params) {
  const e = params?.extent, o = params?.extentOrigin;
  if (!Array.isArray(e) || e.length !== 6) return null;
  if (Array.isArray(o) && o.length === 3 && !params.anisotropy) {
    const r = (v) => Math.round(v).toLocaleString("en-US");
    return { label: "Model extent (project coordinates)", text: `E ${r(e[0] + o[0])}–${r(e[1] + o[0])} · N ${r(e[2] + o[1])}–${r(e[3] + o[1])} · Z ${r(e[4] + o[2])}–${r(e[5] + o[2])}` };
  }
  return { label: params.anisotropy ? "Model extent (solve frame: from the scene origin, warped by the trend)" : "Model extent (solve frame: from the scene origin)", text: e.join(", ") };
}

export function paramRows(params) {
  const out = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (SKIP.has(k) || v === null || v === undefined) continue;
    if (k === "extent") { const x = extentText(params); if (x) out.push({ key: k, ...x }); continue; }
    out.push({ key: k, label: keyLabel(k), text: k === "engineDtype" ? PRECISION[v] || String(v) : valueText(v) });
  }
  return out;
}
