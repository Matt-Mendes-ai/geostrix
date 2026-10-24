// TASKS.csv #843 — anomaly maps of surface samples: one element by its saved threshold (#841) or by percentile classes,
// or a pathfinder index for a deposit type; the classes are judged within populations (medium, a file column, or the map
// unit a sample falls in), and a spatial-coherence check marks anomalies that stand alone. Matt: "Keep going" (#839
// build order 3; docs/ideas/soils-stream-sediments.md 4.2, 4.4, 6.1). The legend states the rule, so a printed map
// can be reviewed.
//
// Pathfinder index = the MEAN of the robust z-scores ((log10 x - median) / 1.4826 MAD, within the sample's population;
// lib/thresholds.js robustZ) of the index's elements the sample has (at least half of them, else no index). A mean,
// not a sum, so samples missing an element stay on the same scale. The presets are STARTING suites from the
// deposit-model literature; they vary with cover, climate and weathering and are meant to be edited after an
// orientation survey. Additive indices are criticized as arbitrary next to multivariate methods (Grunsky 2010); they
// are offered because they are transparent.
//
// Coherence: an anomalous sample (top class) with fewer than `minNeighbours` other anomalous samples within `radius`
// metres is "isolated" - usually a nugget, contamination or a typing error; coherent anomalies are the targets.
import { populations, groupKeyFn, candidateThresholds, robustZ, quantileSorted } from "./thresholds.js";
import { valueIn } from "./geochem.js";

export const PATHFINDER_PRESETS = [
  { id: "porphyry", label: "Porphyry Cu (± Au, Mo)", elements: ["Cu", "Mo", "Au", "Ag"], ref: "Sillitoe 2010; Halley et al. 2015" },
  { id: "porphyry_halo", label: "Porphyry outer halo", elements: ["Zn", "Mn", "Pb", "Ag"], ref: "Halley et al. 2015" },
  { id: "epithermal", label: "Epithermal Au–Ag", elements: ["Au", "Ag", "As", "Sb", "Hg", "Tl", "Se", "Te"], ref: "Hedenquist et al. 2000" },
  { id: "vms", label: "Volcanogenic massive sulphide (VMS)", elements: ["Cu", "Zn", "Pb", "Ag", "Au", "Ba", "Hg", "Tl"], ref: "Galley et al. 2007" },
  { id: "orogenic", label: "Orogenic Au", elements: ["Au", "As", "Sb", "W", "Bi", "Te"], ref: "Goldfarb et al. 2005" },
  { id: "carlin", label: "Carlin-type Au", elements: ["Au", "As", "Sb", "Hg", "Tl"], ref: "Cline et al. 2005" },
  { id: "sedex", label: "Sediment-hosted Zn–Pb (SEDEX / MVT)", elements: ["Zn", "Pb", "Ag", "Ba", "Tl", "Mn"], ref: "Leach et al. 2005" },
  { id: "nicupge", label: "Magmatic Ni–Cu–PGE", elements: ["Ni", "Cu", "Co", "Cr", "Pt", "Pd"], ref: "Naldrett 2004" },
  { id: "lct", label: "LCT pegmatite / lithium", elements: ["Li", "Cs", "Rb", "Ta", "Sn", "Be", "Nb"], ref: "Selway et al. 2005" },
  { id: "uranium", label: "Unconformity uranium", elements: ["U", "Ni", "Co", "As", "B", "Pb"], ref: "Jefferson et al. 2007" },
  { id: "iocg", label: "Iron oxide copper–gold (IOCG)", elements: ["Cu", "Au", "U", "La", "Ce", "Co"], ref: "Williams et al. 2005" },
];

export const DEFAULT_ANOMALY = { mode: "medium", symbol: null, scheme: "threshold", preset: "porphyry", elements: null, groupBy: null, coherence: false, radius: 100, minNeighbours: 1 };
const NODATA = "#e6e6e6";
const SCHEMES = {
  threshold: ["#bdbdbd", "#fd8d3c", "#d7301f"],
  percentile: ["#bdbdbd", "#fed976", "#feb24c", "#fd8d3c", "#e31a1c", "#800026"],
  index: ["#bdbdbd", "#fecc5c", "#fd8d3c", "#e31a1c"],
};
const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toPrecision(2));

// samples (the drawn ones), cfg (DEFAULT_ANOMALY + choices), ctx { units, mapLayers, thresholds (store.geochemThresholds) }
// -> { classOf: Int8Array (-1 no value), isolated: Uint8Array, classes: [{ label, color }], label, notes: [{ text, params }] (for t()), anomalousFrom }
export function anomalyClasses(samples, cfg, { units = {}, mapLayers = [], thresholds = [] } = {}) {
  const n = samples.length, classOf = new Int8Array(n).fill(-1), notes = [];
  const c = { ...DEFAULT_ANOMALY, ...cfg };
  let classes = [], label = "", anomalousFrom = Infinity;
  if (c.mode === "element" && c.symbol) {
    const sym = c.symbol, unit = units[sym] || "ppm";
    const saved = thresholds.find((t) => t.symbol === sym);
    const scheme = c.scheme === "threshold" && saved ? "threshold" : "percentile";
    if (c.scheme === "threshold" && !saved) notes.push({ text: "No threshold saved for {sym} (Geochem > Thresholds): percentile classes shown instead.", params: { sym } });
    const groupBy = c.groupBy || (scheme === "threshold" ? saved.groupBy : "medium");
    const pops = populations(samples, { valueOf: (s) => valueIn(s, sym, unit, units), keyOf: groupKeyFn(groupBy, mapLayers) });
    if (scheme === "threshold") {
      classes = [{ label: `below the 75th percentile` }, { label: `75th percentile to the threshold` }, { label: `at or above the threshold (anomalous)` }];
      anomalousFrom = 2;
      pops.forEach((p) => {
        let t = saved.values?.[p.key];
        if (t == null) { t = candidateThresholds(p.summary).values[saved.method]; if (t != null) notes.push({ text: "\"{pop}\" was not in the saved populations: its {rule} recomputed ({t} {unit}).", params: { pop: p.key, rule: saved.methodLabel, t: fmt(t), unit } }); }
        const p75 = quantileSorted(p.summary.sorted, 0.75);
        p.idx.forEach((i, k) => { const v = p.values[k]; classOf[i] = t != null && v >= t ? 2 : v >= p75 ? 1 : 0; });
      });
      label = `${sym} (${unit}): ${saved.methodLabel}${saved.ref ? ` (${saved.ref})` : ""}, populations by ${String(saved.groupLabel || groupBy).toLowerCase()}, decided ${saved.decided}`;
    } else {
      const cuts = [0.5, 0.75, 0.9, 0.95, 0.98];
      classes = [{ label: "below the 50th percentile" }, { label: "50th–75th percentile" }, { label: "75th–90th percentile" }, { label: "90th–95th percentile" }, { label: "95th–98th percentile" }, { label: "98th percentile and above" }];
      anomalousFrom = 4;
      pops.forEach((p) => {
        const q = cuts.map((x) => quantileSorted(p.summary.sorted, x));
        p.idx.forEach((i, k) => { const v = p.values[k]; let cl = 0; q.forEach((qq, j) => { if (v >= qq) cl = j + 1; }); classOf[i] = cl; });
      });
      label = `${sym} (${unit}): percentile classes within each population (${groupLabelOf(groupBy)})`;
    }
    classes = classes.map((x, i) => ({ ...x, color: SCHEMES[scheme][i] }));
  } else if (c.mode === "index") {
    const preset = PATHFINDER_PRESETS.find((p) => p.id === c.preset) || PATHFINDER_PRESETS[0];
    const wanted = (c.elements?.length ? c.elements : preset.elements);
    const have = new Set(Object.keys(units));
    const els = wanted.filter((e) => have.has(e));
    const missing = wanted.filter((e) => !have.has(e));
    if (missing.length) notes.push({ text: "Not in the samples: {list}.", params: { list: missing.join(", ") } });
    const groupBy = c.groupBy || "medium";
    const keyOf = groupKeyFn(groupBy, mapLayers);
    const zs = samples.map(() => []);
    els.forEach((sym) => {
      const pops = populations(samples, { valueOf: (s) => valueIn(s, sym, units[sym] || "ppm", units), keyOf });
      pops.forEach((p) => p.idx.forEach((i, k) => { const z = robustZ(p.values[k], p.summary); if (z != null) zs[i].push(z); }));
    });
    const need = Math.max(1, Math.ceil(els.length / 2));
    zs.forEach((list, i) => {
      if (list.length < need) return;
      const m = list.reduce((a, v) => a + v, 0) / list.length;
      classOf[i] = m >= 3 ? 3 : m >= 2 ? 2 : m >= 1 ? 1 : 0;
    });
    classes = [{ label: "index below 1" }, { label: "index 1 to 2" }, { label: "index 2 to 3" }, { label: "index 3 and above" }].map((x, i) => ({ ...x, color: SCHEMES.index[i] }));
    anomalousFrom = 2;
    label = `${preset.label} index: mean robust z of ${els.join(", ") || "(none of its elements)"}${c.elements?.length ? " (edited)" : ""}; ${preset.ref}; within ${groupLabelOf(groupBy)}`;
  } else {
    return null;
  }
  // coherence
  const isolated = new Uint8Array(n);
  let isolatedCount = 0, anomalousCount = 0;
  if (c.coherence) {
    const R = Math.max(1, Number(c.radius) || 100), need = Math.max(1, Number(c.minNeighbours) || 1);
    const cell = new Map(), key = (x, y) => `${Math.floor(x / R)},${Math.floor(y / R)}`;
    samples.forEach((s, i) => { if (classOf[i] >= anomalousFrom) { const k = key(s.x, s.y); (cell.get(k) || cell.set(k, []).get(k)).push(i); } });
    samples.forEach((s, i) => {
      if (classOf[i] < anomalousFrom) return;
      anomalousCount++;
      const cx = Math.floor(s.x / R), cy = Math.floor(s.y / R);
      let nb = 0;
      for (let dx = -1; dx <= 1 && nb < need; dx++) for (let dy = -1; dy <= 1 && nb < need; dy++) {
        for (const j of cell.get(`${cx + dx},${cy + dy}`) || []) if (j !== i && Math.hypot(samples[j].x - s.x, samples[j].y - s.y) <= R) { nb++; if (nb >= need) break; }
      }
      if (nb < need) { isolated[i] = 1; isolatedCount++; }
    });
    notes.push(need === 1
      ? { text: "{n} of {m} anomalous samples are isolated (no other anomalous sample within {r} m): drawn small.", params: { n: isolatedCount, m: anomalousCount, r: R } }
      : { text: "{n} of {m} anomalous samples are isolated (fewer than {need} anomalous neighbours within {r} m): drawn small.", params: { n: isolatedCount, m: anomalousCount, need, r: R } });
  }
  return { classOf, isolated, classes, label, notes, anomalousFrom, noDataColor: NODATA, coherence: !!c.coherence, radius: c.radius, minNeighbours: c.minNeighbours };
}
function groupLabelOf(groupBy) {
  if (!groupBy || groupBy === "none") return "all samples together";
  if (groupBy === "medium") return "each sampling medium";
  if (groupBy.startsWith("attr:")) return `each value of ${groupBy.slice(5)}`;
  if (groupBy.startsWith("layer:")) return `each unit of the map layer (${groupBy.split(":").slice(2).join(":")})`;
  return groupBy;
}

// The legend group of an anomaly map (lib/legendGroups.js shape): the rule as its label, one swatch per class
export function anomalyLegendGroup(a) {
  if (!a) return null;
  const items = a.classes.map((c) => [c.label, c.color]);
  if (a.coherence) items.push(["small symbol: isolated anomaly", a.classes[a.classes.length - 1].color]);
  items.push(["no value", a.noDataColor]);
  return { key: "surface_anomaly", label: a.label, items, alwaysHead: true }; // the rule is printed even when it is the only group
}

