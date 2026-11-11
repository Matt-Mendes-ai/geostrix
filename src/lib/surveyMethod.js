// TASKS.csv #2494 (review #2486, WA lithium) — a survey's method column (Surv_Type: Assumed 2,882, Gyro 2,413, GYRO 100) was kept as an
// extra field (#2187) but used nowhere: 2,135 of 2,248 holes had only 'Assumed' stations and were drawn, checked and exported like
// gyro-surveyed ones. Pure helpers: which stations were measured, the column that says so, each hole's summary, the case variants folded.

// a station's method -> "assumed" (nobody measured the direction: planned, nominal, design, collar set-up, estimated) | "measured" | null
const ASSUMED = /^(assumed|assume|nominal|plan(ned)?|design(ed)?|collar([\s_-]*(shot|set[\s_-]*up|setup|orientation|az(imuth)?))?|est(imated)?|none|no[\s_-]*survey|not[\s_-]*surveyed|unsurveyed|default|theoretical|projected)$/i;
const MEASURED = /gyro|reflex|ems|eastman|multi[\s_-]*shot|single[\s_-]*shot|\bmss?\b|\bsss?\b|deviflex|devi[\s_-]*shot|north[\s_-]*seeking|maxibor|camera|tropari|acid|magnetic|mag[\s_-]*shot|survey(ed)?[\s_-]*tool|downhole|\bdh\b|wireline|electronic|digital|champ|ezshot|ez[\s_-]*trac|trushot|sprint|azi[\s_-]*aligner|imdex|boart|devico|surveyed|measured/i;
export function surveyMethodClass(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (ASSUMED.test(s)) return "assumed";
  if (MEASURED.test(s)) return "measured";
  return null;
}

// the method column on stored survey rows: a key named like one (#2187's SURVEY_METHOD) whose values classify. -> key or null
const METHOD_KEY = /^(surv(ey)?[\s_-]*(type|method|tool|instrument)|instrument|method|tool|survey[\s_-]*instrument)$/i;
export function surveyMethodKey(survey) {
  const keys = new Set();
  for (const r of (survey || []).slice(0, 2000)) for (const k of Object.keys(r || {})) if (METHOD_KEY.test(k)) keys.add(k);
  let best = null, bestN = 0;
  for (const k of keys) {
    let n = 0; for (const r of survey) if (surveyMethodClass(r?.[k])) n++;
    if (n > bestN) { best = k; bestN = n; }
  }
  return best;
}

// per hole: "measured" when any station was measured, "assumed" when every classified station was assumed; holes with no classified
// station are left out. -> { key, byHole: Map(hole -> class), assumed: [ids], measured: n, values: Map(value -> count) } or null
export function surveyMethodByHole(survey, key = surveyMethodKey(survey)) {
  if (!key) return null;
  const byHole = new Map(), values = new Map();
  for (const r of survey || []) {
    const v = String(r?.[key] ?? "").trim(), c = surveyMethodClass(v);
    if (v) values.set(v, (values.get(v) || 0) + 1);
    if (!c || !r.hole_id) continue;
    if (c === "measured" || !byHole.has(r.hole_id)) byHole.set(r.hole_id, byHole.get(r.hole_id) === "measured" ? "measured" : c);
  }
  if (!byHole.size) return null;
  const assumed = [...byHole].filter(([, c]) => c === "assumed").map(([h]) => h);
  return { key, byHole, assumed, measured: byHole.size - assumed.length, values };
}

// the spellings of one value that differ only in case or spacing (Gyro / GYRO) -> the commonest spelling. -> Map(raw -> folded)
export function foldCaseVariants(values) {
  const groups = new Map();
  for (const [v, n] of values) {
    const k = String(v).trim().toLowerCase().replace(/\s+/g, " ");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push([v, n]);
  }
  const out = new Map();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const top = [...list].sort((a, b) => b[1] - a[1])[0][0];
    for (const [v] of list) if (v !== top) out.set(v, top);
  }
  return out;
}
