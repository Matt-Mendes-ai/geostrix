// TASKS.csv #2198 (review #2174, WA gold) — the pXRF button took a lab assay file without a word (722 fire assays would have become screening
// readings kept out of grades, intercepts and composites). A pXRF export carries instrument columns (a reading number, the instrument or its
// serial, the test duration, the light-element 'LE' or 'Bal' balance); a lab file carries its lab's batch columns (lab code, job, dispatch,
// certificate). -> { lab: [headers], pxrf: [headers], looksLikeLab } where looksLikeLab = lab columns and no pXRF ones.
const LAB = /(^|[\s_-])(lab[\s_-]*(code|job|jobno|job[\s_-]*no|batch|id|name)|labjobno|despatch|dispatch|despatchno|cert(ificate)?[\s_-]*(no|num|number|id)?|work[\s_-]*order|batch[\s_-]*(no|id))($|[\s_-])/i;
const PXRF = /(^|[\s_-])(reading[\s_-]*(no|num|number|#)?|instrument|serial([\s_-]*(no|num|number))?|duration|live[\s_-]*time|test[\s_-]*(time|label|no)|le|bal|balance|mode|beam|calibration|nominal)($|[\s_-])/i;
export function pxrfSignature(headers) {
  const hs = (headers || []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const lab = hs.filter((h) => LAB.test(h)), pxrf = hs.filter((h) => PXRF.test(h));
  return { lab, pxrf, looksLikeLab: lab.length > 0 && pxrf.length === 0 };
}
