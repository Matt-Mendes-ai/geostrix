// TASKS.csv #3323 — a DC survey's AppRho came in as 'MT / AMT: apparent resistivity' on a linear colour scale over 3.5 decades
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessSurveyMethod, guessSurveyMethodFrom, fileHints } from "../src/lib/geophysSurveys.js";
import { surveyMetaFor } from "../src/lib/surveyLegendDefault.js";
import { isLogSpaced } from "../src/lib/pointSurveyScale.js";

test("#3323 AppRho / RhoA is DC resistivity unless the file has MT columns", () => {
  for (const h of ["AppRho", "RhoA", "rhoa_ohmm", "Apparent resistivity"]) assert.equal(guessSurveyMethod(h), "res", h);
  assert.equal(guessSurveyMethodFrom("AppRho", [], { columns: ["X", "Y", "Z", "AppRho"] }), "res");
  assert.equal(guessSurveyMethodFrom("AppRho", [], { columns: ["X", "Y", "Z", "AppRho", "AppMx"] }), "res");
  assert.equal(guessSurveyMethodFrom("RhoA", [], { columns: ["X", "Y", "Freq_Hz", "RhoA", "Phase"] }), "mt_rho");
  assert.equal(guessSurveyMethodFrom("RhoA", [], { columns: ["X", "Y", "Period", "RhoA"] }), "mt_rho");
  assert.equal(guessSurveyMethodFrom("RhoA", [], { columns: ["X", "Y", "Freq", "RhoA", "Phase", "Chargeability"] }), "res"); // spectral IP
  assert.equal(guessSurveyMethod("AMT"), "mt_rho"); // the method's own name still reads as MT
  assert.equal(fileHints({ columns: ["x", "y", "rhoxy", "phixy"] }).mtSet, true);
  assert.equal(fileHints({ columns: ["x", "y", "phase"] }).mtSet, false); // a bare phase is not enough (spectral IP has one)
});

test("#3323 a resistivity or conductivity survey spanning a decade or more starts on the log scale", () => {
  const vals = Array.from({ length: 500 }, (_, i) => 10 * 10 ** ((3.47 * i) / 499)); // 10 to 29,500 ohm-m
  const m = surveyMetaFor("res", vals);
  assert.equal(m.method, "res"); assert.equal(m.units, "Ω·m");
  assert.ok(m.legend && isLogSpaced(m.legend.stops), "log stops"); assert.equal(m.legend.colorMode, "continuous");
  assert.ok(surveyMetaFor("em_cond", vals).legend);
  assert.equal(surveyMetaFor("res", vals.map((v) => 100 + v / 1000)).legend, undefined); // under a decade: linear
  assert.equal(surveyMetaFor("ip", vals).legend, undefined); // chargeability stays linear
  assert.equal(surveyMetaFor("res", [-5, ...vals]).legend?.stops?.length > 0, true); // one negative outlier past the 2 %: still positive
  assert.equal(surveyMetaFor("mag", vals).legend, undefined);
});

test("#3323 the imports write surveyMetaFor; a survey's own legend is the one shown and edited when it is the only survey", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal((g.match(/updateGeophysSurvey\([^;]*surveyMetaFor\(/g) || []).length, 4);
  assert.doesNotMatch(g, /updateGeophysSurvey\([^)]*\{ method: g, units: SURVEY_METHODS\[g\]\.units \}\)/);
  assert.match(g, /const ownLegend = manySurveys \|\| !!geophysSurveys\[legendKey\]\?\.legend;/);
  assert.match(g, /if \(ownLegend\) \{ updateGeophysSurvey\(legendKey/);
});
