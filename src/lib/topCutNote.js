// TASKS.csv #3783 (Scottie Gold review, 3D Modelling B) — the top cut decides the ounces and the Grade-tonnage table never named it: the same drilling gave 8,010 / 346,000 / 571,000 oz at
// or above 1 g/t for a cap of 2.84 g/t, 30 g/t and none. The estimate record already keeps params.capValue and params.capAudit (what the cap touched and the metal it removed); this reads them
// for the table's basis line and its exported header. Pure.
// -> { kind: "capped", cap, nCapped, nSamples, pctMetal, heavy } | { kind: "uncapped" } | null (a model that carries no estimate record of a cap)
import { CAP_WARN_PCT } from "./capWarning.js";

export function topCutOf(params) {
  if (!params || !params.element || !params.tool) return null; // an imported model, a calculated one: no cap to name
  const cap = Number(params.capValue);
  if (!Number.isFinite(cap) || !(cap > 0)) return { kind: "uncapped" };
  const a = params.capAudit;
  const pct = a && Number.isFinite(a.pctMetalRemoved) ? a.pctMetalRemoved : null;
  return { kind: "capped", cap, nCapped: a?.nCapped ?? null, nSamples: a?.nSamples ?? null, pctMetal: pct, heavy: pct != null && pct > CAP_WARN_PCT };
}

// the header line for an exported table (English: a file's text)
export function topCutLine(params, unitLabel = "") {
  const t = topCutOf(params);
  if (!t) return null;
  if (t.kind === "uncapped") return "Top cut: none (the highest samples entered the estimate at full grade)";
  const u = unitLabel ? ` ${unitLabel}` : "";
  return `Top cut: grades above ${t.cap}${u} were capped before estimating${t.nSamples != null ? ` (${t.nCapped} of ${t.nSamples} samples${t.pctMetal != null ? `, ${Math.round(t.pctMetal * 10) / 10}% of the metal removed` : ""})` : ""}`;
}
