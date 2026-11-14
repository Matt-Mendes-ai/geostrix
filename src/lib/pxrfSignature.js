// TASKS.csv #2198 (review #2174, WA gold) — the pXRF button took a lab assay file without a word (722 fire assays would have become screening
// readings kept out of grades, intercepts and composites). A pXRF export carries instrument columns (a reading number, the instrument or its
// serial, the test duration, the light-element 'LE' or 'Bal' balance); a lab file carries its lab's batch columns (lab code, job, dispatch,
// certificate). -> { lab: [headers], pxrf: [headers], looksLikeLab } where looksLikeLab = lab columns and no pXRF ones.
const LAB = /(^|[\s_-])(lab[\s_-]*(code|job|jobno|job[\s_-]*no|batch|id|name)|labjobno|despatch|dispatch|despatchno|cert(ificate)?[\s_-]*(no|num|number|id)?|work[\s_-]*order|batch[\s_-]*(no|id))($|[\s_-])/i;
const PXRF = /(^|[\s_-])(reading[\s_-]*(no|num|number|#)?|instrument|serial([\s_-]*(no|num|number))?|duration|live[\s_-]*time|test[\s_-]*(time|label|no)|le|bal|balance|mode|beam|calibration|nominal)($|[\s_-])/i;
// TASKS.csv #3294 (#3226 (8), Galore Creek) — a lab file with no batch column but the lab's method codes inside the analyte names (Au_PGM-ICP23_ppm,
// Cu_OG62_pct, In_MEMS61_ppm): two or more such columns say lab too
const METHOD = /(^|[\s_-])(me-?ms\d{2}[a-z]?|mems\d{2}[a-z]?|me-?icp\d{2}[a-z]?|me-?xrf\d{2}[a-z]?|pgm-?icp\d{2}|pgm-?ms\d{2}|icp-?\d{2}[a-z]?|og-?\d{2}[a-z]?|aa-?\d{2}|au-?aa\d{2}|gra-?\d{2}|fa-?\d{2,3}|cu-?aa\d{2}[a-z]?)($|[\s_-])/i;
export function pxrfSignature(headers) {
  const hs = (headers || []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const lab = hs.filter((h) => LAB.test(h)), pxrf = hs.filter((h) => PXRF.test(h)), methods = hs.filter((h) => METHOD.test(h)); // methods: #3294
  const byMethod = !lab.length && methods.length >= 2;
  return { lab: byMethod ? [...methods.slice(0, 4), ...(methods.length > 4 ? ["…"] : [])] : lab, pxrf, methods, looksLikeLab: (lab.length > 0 || byMethod) && pxrf.length === 0 };
}
