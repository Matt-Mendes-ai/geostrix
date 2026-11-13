// TASKS.csv #1345 — the part of qaqc.js the startup code needs (moved verbatim): sample-type rules and the collar ids.
// TASKS.csv #400 — name matching alone silently dropped real holes: "BLK-22-01" (a Block-22 hole) or
// "STD-..." read as QC and vanished from intercepts, compositing, estimation. Now, in order:
//   1. a sample_type / QC-type column on the row (acQuire / MX exports keep QC under the real hole_id and
//      mark it there) decides, when it holds a recognisable value;
//   2. a hole that exists in the COLLAR table is a drillhole, never a QC insert, whatever its name
//      (the store registers collar ids here — setKnownHoleIds);
//   3. only then the hole_id substring patterns.
let registeredHoles = null;
export function setKnownHoleIds(ids) { registeredHoles = ids && ids.size !== 0 ? new Set(ids) : null; }
const TYPE_RULES = [
  ["blank", /^(blk|blank|bl)\b|^(field_?blank|coarse_?blank|pulp_?blank)/],
  // #534 — also the coarse-reject / prep / lab labels exports use ("Coarse reject dup", "Prep Duplicate", "CRD", "Lab rep"): unrecognised,
  // such a row on its original's interval was read as a drill sample (counted twice in grades, missing from QAQC)
  ["duplicate", /^(dup|duplicate|fd|cd|pd|crd|rep|repeat|field_?dup|coarse_?(dup|rej|reject)|pulp_?(dup|rep)|prep_?dup|lab_?(dup|rep)|rej(ect)?_?dup|twin)/],
  ["standard", /^(std|standard|crm|srm|ref|reference|oreas|cert)/],
  ["regular", /^(sample|samp|core|rc|dd|reg|regular|primary|prim|original|orig|routine|drill|norm|normal|assay)/],
];
// TASKS.csv #601 — a row MARKED as a QC sample by its sample_type (lab-certificate imports, acQuire / MX exports):
// it sits on a real hole's interval (a duplicate on its original's, a standard / blank at its insertion point), so
// the 3D grade display, Data QC's interval checks and the assay merge key must not treat it as a drill sample.
export function isMarkedQcRow(row) { const c = sampleTypeClass(row?.sample_type); return c === "standard" || c === "blank" || c === "duplicate"; }
export function sampleTypeClass(t) {
  const s = String(t ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return null;
  for (const [cls, re] of TYPE_RULES) if (re.test(s)) return cls;
  return null; // unrecognised label -> fall back to the other rules
}
export const knownHoleIds = () => registeredHoles;
// TASKS.csv #1673 — a pXRF reading, not a lab grade (qaqc.js's notes). TASKS.csv #3159: moved here from qaqc.js, which the 3D view's
// import of it had put in the startup bundle; qaqc.js re-exports it.
export const isPxrfRow = (a) => a?.source === "pXRF";
