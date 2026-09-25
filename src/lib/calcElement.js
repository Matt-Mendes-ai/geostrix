// TASKS.csv #401 — calculated assay columns. Vectoring indices (Ishikawa AI, CCPI, Zn/(Zn+Pb), Cu/(Cu+Zn))
// are the main VMS exploration tools, but they only existed as scatter plots; they could not be shown
// downhole, in 3D, on sections, or composited. A calculated element is stored like any other element
// (a value on each assay row + an assayElements entry), so everything that takes an element — 3D assay
// display, strip logs, intercepts, compositing, estimation, sections — takes it too.
//
// Formulas use the safe expression compiler (#344, no eval). Element symbols are the variables, read in
// the unit each element is stored in (see the element list). Rows missing any element in the formula get
// no value (NaN is never stored), so an index is never computed from a partial analysis.
import { compileCalc } from "./calcExpr.js";

// Element wt% -> oxide wt% factors are written into the presets so AI/CCPI use oxides as defined.
export const CALC_PRESETS = [
  { name: "AI", label: "Ishikawa alteration index (AI)", expr: "100*(K*1.2046+Mg*1.6583)/(K*1.2046+Mg*1.6583+Na*1.3480+Ca*1.3992)", needs: ["K", "Mg", "Na", "Ca"], unitNote: "K, Mg, Na, Ca must be in %" },
  { name: "CCPI", label: "Chlorite-carbonate-pyrite index (CCPI)", expr: "100*(Mg*1.6583+Fe*1.2865)/(Mg*1.6583+Fe*1.2865+Na*1.3480+K*1.2046)", needs: ["Mg", "Fe", "Na", "K"], unitNote: "Mg, Fe, Na, K must be in %; Fe as FeO total" },
  { name: "ZnRatio", label: "Zn ratio 100·Zn/(Zn+Pb)", expr: "100*Zn/(Zn+Pb)", needs: ["Zn", "Pb"], unitNote: "Zn and Pb in the same unit" },
  { name: "CuRatio", label: "Cu ratio 100·Cu/(Cu+Zn)", expr: "100*Cu/(Cu+Zn)", needs: ["Cu", "Zn"], unitNote: "Cu and Zn in the same unit" },
];

// Returns { assays, element, computed, skipped, min, max } or throws with a readable message.
export function addCalculatedElement(assays, assayElements, name, expr, unit = "index") {
  const n = String(name || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw new Error("Name must start with a letter and use only letters, digits and _.");
  if ((assayElements || []).some((e) => e.symbol === n)) throw new Error(`"${n}" already exists — pick another name.`);
  const symbols = (assayElements || []).map((e) => e.symbol);
  const fn = compileCalc(expr, symbols); // throws on bad syntax / unknown names
  let computed = 0, skipped = 0, min = Infinity, max = -Infinity;
  const out = (assays || []).map((a) => {
    const v = fn(a.values || {});
    if (!Number.isFinite(v)) { skipped++; return a; }
    computed++; if (v < min) min = v; if (v > max) max = v;
    return { ...a, values: { ...(a.values || {}), [n]: v } };
  });
  if (!computed) throw new Error("The formula gave no value on any assay row — check that every element in it has results.");
  return { assays: out, element: { symbol: n, unit, calculated: { expr: String(expr).trim() } }, computed, skipped, min, max };
}
