// TASKS.csv #1313 — the classification diagrams, spider plots, alteration boxes and method tables: 40 kB only Geochem needs, split from geochem.js so
// they load with that tab. geochem.js is in the startup bundle for a few helpers, and a module's exports all land in one chunk.
import { valueIn, toOxide } from "./geochem.js";

function winchesterClass(nbY, zrTi) {
  // approximate boundaries of Winchester & Floyd (1977)
  if (nbY < 0.7) {
    if (zrTi < 0.0025) return "SUB-ALK";
    if (zrTi < 0.008) return "AND-BAS";
    if (zrTi < 0.02) return "AND";
    return "RHY-DAC";
  }
  if (zrTi < 0.008) return "ALK-BAS";
  if (zrTi < 0.02) return "TRACHY";
  return "FONO";
}
// ---------- reference field polygons (approximate, for visual guidance) ----------
function tasFields() {
  return [
    { name: "Basalt", pts: [[45, 0], [45, 5], [52, 5], [52, 0]] },
    { name: "Basaltic andesite", pts: [[52, 0], [52, 5], [57, 5.9], [57, 0]] },
    { name: "Andesite", pts: [[57, 0], [57, 5.9], [63, 7], [63, 0]] },
    { name: "Dacite", pts: [[63, 0], [63, 7], [69, 8], [77, 0]] },
    { name: "Rhyolite", pts: [[69, 8], [77, 0], [77, 12], [69, 13]] },
    { name: "Trachyte", pts: [[63, 7], [69, 8], [69, 13], [65, 14.5], [57.6, 11.7]] },
    { name: "Trachyandesite", pts: [[57, 5.9], [63, 7], [57.6, 11.7], [53, 9.3], [49.4, 7.3]] },
    { name: "Tephrite/Basanite", pts: [[41, 3], [45, 5], [49.4, 7.3], [45, 9], [41, 7]] },
    { name: "Phonolite", pts: [[52.5, 14], [57.6, 11.7], [65, 14.5], [60, 16]] },
    { name: "Picrobasalt", pts: [[41, 0], [41, 3], [45, 3], [45, 0]] },
  ];
}
function winchesterFields() {
  // drawn in log space by the renderer; these are boundary polylines in (Nb/Y, Zr/TiO2)
  return [
    { name: "Rhyolite/Dacite", box: [[0.7, 0.02], [0.02, 0.1]] },
    { name: "Andesite", box: [[0.7, 0.008], [0.02, 0.02]] },
    { name: "Bas-And", box: [[0.7, 0.0025], [0.02, 0.008]] },
    { name: "Subalkaline basalt", box: [[0.7, 0.0001], [0.02, 0.0025]] },
    { name: "Alkali basalt", box: [[10, 0.0001], [0.7, 0.008]] },
    { name: "Trachyandesite", box: [[10, 0.008], [0.7, 0.02]] },
    { name: "Phonolite", box: [[10, 0.02], [0.7, 0.1]] },
  ];
}
function afmDivider() {
  // Irvine & Baragar (1971) tholeiitic/calc-alkaline dividing line, in A-F-M fractions -> xy
  const raw = [
    [0.0, 0.6, 0.4], [0.05, 0.62, 0.33], [0.1, 0.63, 0.27], [0.18, 0.6, 0.22],
    [0.28, 0.53, 0.19], [0.4, 0.44, 0.16], [0.5, 0.36, 0.14], [0.62, 0.26, 0.12], [0.78, 0.13, 0.09],
  ];
  return raw.map(([a, f, m]) => ternaryXY(a, f, m));
}
// ---------- ternary helpers ----------
function ternaryXY(a, f, m) {
  // a at top, f bottom-left, m bottom-right; returns {x:0..1, y:0..1}
  const x = 0.5 * (2 * m + a) / (a + f + m || 1);
  const y = (Math.sqrt(3) / 2) * a / (a + f + m || 1);
  return { x, y };
}

// ---------- diagram definitions ----------
// Each: id, label, requires[], xLabel, yLabel, log{x,y}, project(sample, units) -> {x,y} | null,
// fields[] (polygon boundaries drawn as reference), and optional axis ranges.

export const DIAGRAMS = {
  tas: {
    id: "tas",
    label: "TAS (Le Bas et al. 1986)",
    caption: "Total alkali–silica. Requires fresh rock; alkalis are alteration-mobile.",
    requires: ["Si", "Na", "K"],
    xLabel: "SiO₂ (wt%)", yLabel: "Na₂O + K₂O (wt%)",
    xRange: [35, 80], yRange: [0, 16],
    project: (s, u) => {
      const Si = valueIn(s, "Si", "%", u), Na = valueIn(s, "Na", "%", u), K = valueIn(s, "K", "%", u);
      if ([Si, Na, K].some((v) => v == null)) return null;
      return { x: toOxide(Si, "Si"), y: toOxide(Na, "Na") + toOxide(K, "K") };
    },
    fields: tasFields(),
  },
  winchester: {
    id: "winchester",
    label: "Zr/TiO₂ vs Nb/Y (Winchester & Floyd 1977)",
    caption: "Immobile-element classification. Robust to alteration.",
    requires: ["Zr", "Ti", "Nb", "Y"],
    xLabel: "Nb/Y", yLabel: "Zr/TiO₂",
    logX: true, logY: true,
    xRange: [0.01, 10], yRange: [0.0001, 0.1],
    project: (s, u) => {
      const Zr = valueIn(s, "Zr", "ppm", u), Ti = valueIn(s, "Ti", "%", u), Nb = valueIn(s, "Nb", "ppm", u), Y = valueIn(s, "Y", "ppm", u);
      if ([Zr, Ti, Nb, Y].some((v) => v == null) || Y === 0 || Ti === 0) return null;
      const TiO2 = toOxide(Ti, "Ti"); // wt%
      return { x: Nb / Y, y: Zr / (TiO2 * 10000) }; // Zr(ppm)/TiO2(ppm)
    },
    fields: winchesterFields(),
  },
  afm: {
    id: "afm",
    label: "AFM (Irvine & Baragar 1971)",
    caption: "Tholeiitic vs calc-alkaline. Ternary A=Na₂O+K₂O, F=FeOt, M=MgO.",
    requires: ["Na", "K", "Fe", "Mg"],
    ternary: true,
    corners: ["A (Na₂O+K₂O)", "F (FeOt)", "M (MgO)"],
    project: (s, u) => {
      const Na = valueIn(s, "Na", "%", u), K = valueIn(s, "K", "%", u), Fe = valueIn(s, "Fe", "%", u), Mg = valueIn(s, "Mg", "%", u);
      if ([Na, K, Fe, Mg].some((v) => v == null)) return null;
      const A = toOxide(Na, "Na") + toOxide(K, "K"), F = toOxide(Fe, "Fe"), M = toOxide(Mg, "Mg");
      const t = A + F + M; if (t === 0) return null;
      return ternaryXY(A / t, F / t, M / t);
    },
    dividers: afmDivider(),
  },
  boxplot: {
    id: "boxplot",
    label: "Alteration Box Plot (Large et al. 2001)",
    caption: "Ishikawa AI vs CCPI. Standard for VMS/epithermal alteration vectoring.",
    requires: ["Na", "K", "Mg", "Ca", "Fe"],
    xLabel: "CCPI = 100(MgO+FeOt)/(MgO+FeOt+Na₂O+K₂O)", yLabel: "AI = 100(K₂O+MgO)/(K₂O+MgO+Na₂O+CaO)",
    xRange: [0, 100], yRange: [0, 100],
    project: (s, u) => {
      const Na = valueIn(s, "Na", "%", u), K = valueIn(s, "K", "%", u), Mg = valueIn(s, "Mg", "%", u), Ca = valueIn(s, "Ca", "%", u), Fe = valueIn(s, "Fe", "%", u);
      if ([Na, K, Mg, Ca, Fe].some((v) => v == null)) return null;
      const Na2O = toOxide(Na, "Na"), K2O = toOxide(K, "K"), MgO = toOxide(Mg, "Mg"), CaO = toOxide(Ca, "Ca"), FeO = toOxide(Fe, "Fe");
      const AI = (100 * (K2O + MgO)) / (K2O + MgO + Na2O + CaO || 1);
      const CCPI = (100 * (MgO + FeO)) / (MgO + FeO + Na2O + K2O || 1);
      return { x: CCPI, y: AI };
    },
    boxplotOverlay: true,
  },
  jensen: {
    id: "jensen",
    label: "Jensen cation plot (1976)",
    caption: "Al–(Fe+Ti)–Mg cation ternary for subalkaline volcanics.",
    requires: ["Al", "Fe", "Ti", "Mg"],
    ternary: true,
    corners: ["Al₂O₃", "FeOt+TiO₂", "MgO"],
    project: (s, u) => {
      const Al = valueIn(s, "Al", "%", u), Fe = valueIn(s, "Fe", "%", u), Ti = valueIn(s, "Ti", "%", u), Mg = valueIn(s, "Mg", "%", u);
      if ([Al, Fe, Ti, Mg].some((v) => v == null)) return null;
      const alC = toOxide(Al, "Al") / 50.98, feC = toOxide(Fe, "Fe") / 71.85 + toOxide(Ti, "Ti") / 79.87, mgC = toOxide(Mg, "Mg") / 40.30;
      const t = alC + feC + mgC; if (t === 0) return null;
      return ternaryXY(alC / t, feC / t, mgC / t);
    },
  },
  thnbyb: {
    id: "thnbyb",
    label: "Th/Yb vs Nb/Yb (Pearce 2008)",
    caption: "Immobile ratios; separates arc from MORB/OIB mantle array.",
    requires: ["Th", "Nb", "Yb"],
    xLabel: "Nb/Yb", yLabel: "Th/Yb",
    logX: true, logY: true,
    xRange: [0.1, 100], yRange: [0.01, 10],
    project: (s, u) => {
      const Th = valueIn(s, "Th", "ppm", u), Nb = valueIn(s, "Nb", "ppm", u), Yb = valueIn(s, "Yb", "ppm", u);
      if ([Th, Nb, Yb].some((v) => v == null) || Yb === 0) return null;
      return { x: Nb / Yb, y: Th / Yb };
    },
  },
  tizry: {
    id: "tizry",
    label: "Ti–Zr–Y (Pearce & Cann 1973)",
    caption: "Ternary discrimination for basaltic rocks — immobile elements, robust through greenschist-facies alteration common in VMS footwalls. Fields: A=island-arc tholeiite, B=IAT/MORB/calc-alkali basalt (overlap), C=calc-alkali basalt, D=within-plate basalt.",
    requires: ["Ti", "Zr", "Y"],
    ternary: true,
    corners: ["Ti/100", "Zr", "Y×3"],
    project: (s, u) => {
      const Ti = valueIn(s, "Ti", "ppm", u), Zr = valueIn(s, "Zr", "ppm", u), Y = valueIn(s, "Y", "ppm", u);
      if ([Ti, Zr, Y].some((v) => v == null)) return null;
      const a = Ti / 100, f = Zr, m = Y * 3;
      const t = a + f + m; if (t === 0) return null;
      return ternaryXY(a / t, f / t, m / t);
    },
  },
  thhfta: {
    id: "thhfta",
    label: "Th–Hf–Ta (Wood 1980)",
    caption: "Ternary tectonic discrimination using HFSE/Th — very resistant to hydrothermal alteration, useful for classifying altered VMS-hosting mafic volcanics.",
    requires: ["Th", "Hf", "Ta"],
    ternary: true,
    corners: ["Th", "Hf/3", "Ta"],
    project: (s, u) => {
      const Th = valueIn(s, "Th", "ppm", u), Hf = valueIn(s, "Hf", "ppm", u), Ta = valueIn(s, "Ta", "ppm", u);
      if ([Th, Hf, Ta].some((v) => v == null)) return null;
      const a = Th, f = Hf / 3, m = Ta;
      const t = a + f + m; if (t === 0) return null;
      return ternaryXY(a / t, f / t, m / t);
    },
  },
  per_al_k: {
    id: "per_al_k",
    label: "PER: Al₂O₃ vs 3K₂O (MacLean & Kranidiotis 1987)",
    caption: "Pearce element ratio — molar Al₂O₃ (immobile proxy) plotted against 3×molar K₂O. Unaltered rocks of one precursor fall on a line through the origin; departures above the fitted trend indicate K-metasomatism (sericite/K-feldspar addition), below indicates K loss.",
    requires: ["Al", "K"],
    xLabel: "Al₂O₃ (mol/100g)", yLabel: "3 × K₂O (mol/100g)",
    mineralLines: [{ slope: 1, label: "muscovite / sericite" }, { slope: 3, label: "K-feldspar" }], // #531 — 3K/Al of each mineral
    xRange: [0, 0.4], yRange: [0, 0.3],
    dynamicRange: true, trendLine: true,
    project: (s, u) => {
      const Al = valueIn(s, "Al", "%", u), K = valueIn(s, "K", "%", u);
      if ([Al, K].some((v) => v == null)) return null;
      const molAl2O3 = toOxide(Al, "Al") / MOLAR_MASS.Al2O3;
      const molK2O = toOxide(K, "K") / MOLAR_MASS.K2O;
      return { x: molAl2O3, y: 3 * molK2O };
    },
  },
  per_al_cana: {
    id: "per_al_cana",
    // TASKS.csv #531 — was CaO + 3·Na₂O: albite then plotted on slope 3 and anorthite on slope 1, so plagioclase of
    // different An content never shared a line. In cations the feldspar line is (2Ca + Na)/Al = 1, i.e. in molar
    // oxides (CaO + Na₂O)/Al₂O₃ = 1 for both end-members (checked in test/geochem.test.mjs).
    label: "PER: Al₂O₃ vs CaO+Na₂O (Stanley & Madeisky 1994)",
    caption: "Pearce element ratio — molar Al₂O₃ vs molar (CaO+Na₂O). Plagioclase of any composition (albite to anorthite) plots on the slope-1 feldspar line. Departure below it indicates feldspar destruction (Ca/Na loss — sericitic/chloritic alteration); above indicates carbonate/epidote addition. The fitted trend is this dataset's own.",
    requires: ["Al", "Ca", "Na"],
    xLabel: "Al₂O₃ (mol/100g)", yLabel: "CaO + Na₂O (mol/100g)",
    mineralLines: [{ slope: 1, label: "plagioclase (Ab–An)" }], // #531
    xRange: [0, 0.4], yRange: [0, 0.4],
    dynamicRange: true, trendLine: true,
    project: (s, u) => {
      const Al = valueIn(s, "Al", "%", u), Ca = valueIn(s, "Ca", "%", u), Na = valueIn(s, "Na", "%", u);
      if ([Al, Ca, Na].some((v) => v == null)) return null;
      const molAl2O3 = toOxide(Al, "Al") / MOLAR_MASS.Al2O3;
      const molCaO = toOxide(Ca, "Ca") / MOLAR_MASS.CaO;
      const molNa2O = toOxide(Na, "Na") / MOLAR_MASS.Na2O;
      return { x: molAl2O3, y: molCaO + molNa2O }; // #531
    },
  },
};

const MOLAR_MASS = { Al2O3: 101.96, K2O: 94.2, Na2O: 61.98, CaO: 56.08, MgO: 40.30, FeOt: 71.85, TiO2: 79.87 };

// ---------- REE / multi-element spider diagrams ----------
// Chondrite and primitive-mantle normalization values: McDonough & Sun (1995), ppm.
export const REE_ORDER = ["La", "Ce", "Pr", "Nd", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu"];
export const CHONDRITE_MS95 = { La: 0.237, Ce: 0.612, Pr: 0.095, Nd: 0.467, Sm: 0.153, Eu: 0.058, Gd: 0.2055, Tb: 0.0374, Dy: 0.254, Ho: 0.0566, Er: 0.1655, Tm: 0.0255, Yb: 0.170, Lu: 0.0254 };

export const MULTI_ELEMENT_ORDER = ["Cs", "Rb", "Ba", "Th", "U", "Nb", "Ta", "K", "La", "Ce", "Pr", "Sr", "Nd", "Sm", "Zr", "Hf", "Eu", "Ti", "Gd", "Tb", "Dy", "Y", "Ho", "Er", "Tm", "Yb", "Lu"];
export const PRIMITIVE_MANTLE_MS95 = { Cs: 0.032, Rb: 0.635, Ba: 6.989, Th: 0.085, U: 0.021, Nb: 0.713, Ta: 0.041, K: 250, La: 0.687, Ce: 1.775, Pr: 0.276, Sr: 21.1, Nd: 1.354, Sm: 0.444, Zr: 10.5, Hf: 0.309, Eu: 0.168, Ti: 1300, Gd: 0.596, Tb: 0.108, Dy: 0.737, Y: 4.55, Ho: 0.164, Er: 0.480, Tm: 0.074, Yb: 0.493, Lu: 0.074 };

// SPIDER_DIAGRAMS entries mirror DIAGRAMS' shape closely enough to share the module dropdown, but
// `project` isn't used — GeochemPlot's SpiderPlot renders every sample as its own normalized line
// (via reeProfile below) rather than reducing each sample to a single {x,y} point.
export const SPIDER_DIAGRAMS = {
  ree_chondrite: {
    id: "ree_chondrite", spider: true,
    label: "REE — chondrite-normalized (McDonough & Sun 1995)",
    caption: "Rare-earth element pattern, each sample normalized to chondrite. LREE enrichment/depletion and Eu anomalies are diagnostic of protolith and some alteration/mineralization styles.",
    requires: REE_ORDER, order: REE_ORDER, norm: CHONDRITE_MS95,
  },
  multi_pm: {
    id: "multi_pm", spider: true,
    label: "Multi-element — primitive-mantle-normalized (McDonough & Sun 1995)",
    caption: "Extended trace-element pattern normalized to primitive mantle. Useful for petrogenesis and for spotting LILE mobility (Cs/Rb/Ba/K/Sr) versus HFSE/REE immobility during alteration.",
    requires: MULTI_ELEMENT_ORDER, order: MULTI_ELEMENT_ORDER, norm: PRIMITIVE_MANTLE_MS95,
  },
};

// [{symbol, value}] normalized ratios for one sample; value is null where data is missing or the
// normalizing value is undefined (spider plot drops that vertex, connecting around the gap).
export function reeProfile(sample, elementUnits, order, norm) {
  return order.map((sym) => {
    const v = valueIn(sample, sym, "ppm", elementUnits);
    const n = norm[sym];
    if (v == null || !n) return { symbol: sym, value: null };
    return { symbol: sym, value: v / n };
  });
}

// ---------- TASKS.csv #503 — protolith-aware alteration box plot ----------
// The classifier used to split AI / CCPI at 50/50 into four quadrants with ONE least-altered box, but least-
// altered rocks plot in different places by protolith (Large et al. 2001): fresh basalt has a high CCPI by
// nature, so 139 of Harry's 140 basalt samples came out "epidote-albite" alteration. Each sample is now tested
// against the least-altered box of ITS protolith, and a sample outside the box is named by the direction it
// lies in (the box plot's alteration trends), not by a fixed quadrant.
// PROVISIONAL BOX LIMITS: inside the published least-altered envelope (AI 10-65, CCPI 15-85) but NOT taken
// from Large et al. (2001) fig. 6 itself (it could not be read when this was written). They are editable in
// the app and must be checked against the paper (Matt, 2026-10-05: "option 2").
export const PROTOLITHS = ["rhyolite", "dacite", "andesite", "basalt"];
export const PROVISIONAL_ALTERATION_BOXES = {
  rhyolite: { ai: [20, 65], ccpi: [15, 40] },
  dacite: { ai: [20, 65], ccpi: [25, 50] },
  andesite: { ai: [20, 60], ccpi: [40, 70] },
  basalt: { ai: [20, 55], ccpi: [55, 85] },
};
const PROTOLITH_SHORT = { rhyolite: "RHY", dacite: "DAC", andesite: "AND", basalt: "BAS" };
// A starting guess from a logged code (editable per code in the app).
export function guessProtolith(code) {
  const c = String(code || "").toLowerCase();
  if (/bas|bsl|gab|dol|mafic|^mv/.test(c)) return "basalt";
  if (/and/.test(c)) return "andesite";
  if (/dac/.test(c)) return "dacite";
  if (/rhy|fel|qfp|qp/.test(c)) return "rhyolite";
  return null;
}
// One sample's AI / CCPI against its protolith's box -> a layer code.
export function classifyAlterationBox(ai, ccpi, protolith, boxes = PROVISIONAL_ALTERATION_BOXES) {
  const b = boxes?.[protolith];
  if (!b || !Number.isFinite(ai) || !Number.isFinite(ccpi)) return null;
  const aiHi = ai > b.ai[1], aiLo = ai < b.ai[0], cHi = ccpi > b.ccpi[1], cLo = ccpi < b.ccpi[0];
  if (!aiHi && !aiLo && !cHi && !cLo) return `LA-${PROTOLITH_SHORT[protolith]}`;
  if (aiHi && cHi) return "CHL";   // up and right: chlorite-pyrite(-sericite), the footwall trend
  if (aiHi) return "SER";          // up: sericite / K-feldspar
  if (cHi && aiLo) return "EPI";   // down-right: epidote-calcite (diagenetic / regional)
  if (cHi) return "CARB";          // right: chlorite-carbonate
  if (aiLo) return "ALB";          // down: albite / Na-gain
  return "LOWCCPI";                // in the AI range but left of the box
}
// The protolith of a sample: one fixed for every sample, or from the logged lithology at its midpoint.
export function protolithForSample(sample, { fixed = null, lithoByHole = null, map = {} } = {}) {
  if (fixed) return fixed;
  const rows = lithoByHole?.get(sample.hole_id);
  if (!rows) return null;
  const mid = (Number(sample.from) + Number(sample.to)) / 2;
  const r = rows.find((x) => mid >= Number(x.from) && mid < Number(x.to));
  if (!r) return null;
  const code = String(r.value ?? "").trim();
  return code in map ? map[code] || null : guessProtolith(code);
}

// ---------- alteration / litho classification (reuse projections above) ----------
export const GEOCHEM_METHODS = {
  alteration_boxplot: {
    label: "Ishikawa AI / CCPI against the protolith's least-altered box (after Large et al. 2001)",
    target: "alt", requires: ["Na", "K", "Mg", "Ca", "Fe"],
    // TASKS.csv #503 — opts: { protolith, boxes }; no protolith -> not classified (no guessing a box)
    classify: (v, u, sampleShim, opts = {}) => {
      const s = sampleShim || { values: v };
      const p = DIAGRAMS.boxplot.project(s, u);
      if (!p) return null;
      return classifyAlterationBox(p.y, p.x, opts.protolith, opts.boxes || PROVISIONAL_ALTERATION_BOXES);
    },
  },
  litho_winchester: {
    label: "Winchester–Floyd immobile fields",
    target: "litho", requires: ["Zr", "Ti", "Nb", "Y"],
    classify: (v, u, sampleShim) => {
      const s = sampleShim || { values: v };
      const p = DIAGRAMS.winchester.project(s, u);
      if (!p) return null;
      return winchesterClass(p.x, p.y);
    },
  },
  litho_jensen: {
    label: "Jensen cation fields",
    target: "litho", requires: ["Al", "Fe", "Ti", "Mg"],
    classify: (v, u, sampleShim) => {
      const s = sampleShim || { values: v };
      const Al = valueIn(s, "Al", "%", u), Fe = valueIn(s, "Fe", "%", u), Ti = valueIn(s, "Ti", "%", u), Mg = valueIn(s, "Mg", "%", u);
      if ([Al, Fe, Ti, Mg].some((x) => x == null)) return null;
      const alC = toOxide(Al, "Al") / 50.98, feC = toOxide(Fe, "Fe") / 71.85 + toOxide(Ti, "Ti") / 79.87, mgC = toOxide(Mg, "Mg") / 40.30;
      const t = alC + feC + mgC || 1;
      const a = (alC / t) * 100, f = (feC / t) * 100, m = (mgC / t) * 100;
      if (m > 50) return "KOM";
      if (f > m) return a < 60 ? "THOL-FE" : "THOL-MAFIC";
      if (a < 56) return "CA-BASALT";
      if (a < 64) return "CA-AND";
      if (a < 72) return "CA-DAC";
      return "CA-RHY";
    },
  },
};

export const GEOCHEM_LABELS = {
  SER: "Sericite/K-feldspar trend", CHL: "Chlorite-pyrite trend", EPI: "Epidote-calcite trend", FRESH: "Weak/fresh (older 50/50 quadrants)",
  // TASKS.csv #503 — protolith-box classes (EPI is now 'epidote-calcite', the down-right trend)
  "LA-RHY": "Least altered (rhyolite box)", "LA-DAC": "Least altered (dacite box)", "LA-AND": "Least altered (andesite box)", "LA-BAS": "Least altered (basalt box)",
  CARB: "Chlorite-carbonate trend", ALB: "Albite / Na-gain trend", LOWCCPI: "Low CCPI (left of box)",
  KOM: "Komatiite", "THOL-FE": "Fe-tholeiite", "THOL-MAFIC": "Mg-tholeiite", "CA-BASALT": "Calc-alk. basalt",
  "CA-AND": "Calc-alk. andesite", "CA-DAC": "Calc-alk. dacite", "CA-RHY": "Calc-alk. rhyolite",
  BAS: "Basalt", "AND-BAS": "Basaltic andesite", AND: "Andesite", "RHY-DAC": "Rhyolite/Dacite",
  "ALK-BAS": "Alkali basalt", TRACHY: "Trachyte/Trachyandesite", "SUB-ALK": "Subalkaline basalt", FONO: "Phonolite",
};

// TASKS.csv #1083 — the "projected" CSV of a classification diagram (was inline in GeochemModule): each sample's
// diagram x / y, or for a spider diagram its whole normalized profile, one column per element (a spider plot has no
// single x / y per sample). diagram: a DIAGRAMS / SPIDER_DIAGRAMS entry.
export function diagramExportRows(assays, diagram, elementUnits) {
  if (diagram.spider) {
    return assays.map((a) => {
      const profile = reeProfile(a, elementUnits, diagram.order, diagram.norm);
      return { hole_id: a.hole_id, from: a.from, to: a.to, ...Object.fromEntries(profile.map((p) => [p.symbol, p.value ?? ""])) };
    });
  }
  return assays.map((a) => {
    const p = diagram.project(a, elementUnits);
    // TASKS.csv #1212 — columns named after the axes: "CCPI", "AI", "SiO₂ (wt%)", not x and y
    const axis = (label, fallback) => String(label || fallback).split(" = ")[0];
    return { hole_id: a.hole_id, from: a.from, to: a.to, [axis(diagram.xLabel, "x")]: p?.x ?? "", [axis(diagram.yLabel, "y")]: p?.y ?? "" };
  });
}
