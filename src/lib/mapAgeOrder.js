// TASKS.csv #4001 — the map's own ages as the stratigraphic order. Model from map suggested the order from bedding younging across each
// contact (lib/pileOrder.js); on a folded map that vote can run almost upside down, and the model matched the map on 10 % of the ground.
// Ordered by the map's own ages it matched on 44 %. A unit's age comes from the map's attributes: a max / min age pair named on the
// time scale (or one age field), else the leading age code of its map label (GSC style: Cm Od Sl Dv Cb ...). Members of one formation
// go upper > middle > lower; facies of one formation share its age. Units with no age keep their place in the bedding order. Nothing here
// assumes a region or a deposit type. Pure: no React.

// The time scale in Ma, [older, younger] (International Chronostratigraphic Chart). Subdivisions where a period has none named: thirds.
const P = {
  quaternary: [2.58, 0], neogene: [23.03, 2.58], paleogene: [66, 23.03], tertiary: [66, 2.58], cretaceous: [145, 66], jurassic: [201.4, 145],
  triassic: [251.9, 201.4], permian: [298.9, 251.9], pennsylvanian: [323.2, 298.9], mississippian: [358.9, 323.2], carboniferous: [358.9, 298.9],
  devonian: [419.2, 358.9], silurian: [443.8, 419.2], ordovician: [485.4, 443.8], cambrian: [538.8, 485.4], ediacaran: [635, 538.8],
  cryogenian: [720, 635], tonian: [1000, 720],
  holocene: [0.0117, 0], pleistocene: [2.58, 0.0117], pliocene: [5.333, 2.58], miocene: [23.03, 5.333], oligocene: [33.9, 23.03],
  eocene: [56, 33.9], paleocene: [66, 56],
  cenozoic: [66, 0], mesozoic: [251.9, 66], paleozoic: [538.8, 251.9], neoproterozoic: [1000, 538.8], mesoproterozoic: [1600, 1000],
  paleoproterozoic: [2500, 1600], proterozoic: [2500, 538.8], neoarchean: [2800, 2500], mesoarchean: [3200, 2800], paleoarchean: [3600, 3200],
  eoarchean: [4031, 3600], archean: [4031, 2500], hadean: [4567, 4031], precambrian: [4567, 538.8], phanerozoic: [538.8, 0],
};
// the named Early / Middle / Late boundaries [older, early|middle, middle|late, younger]
const SUB = {
  cambrian: [538.8, 509, 497, 485.4], ordovician: [485.4, 470, 458.4, 443.8], silurian: [443.8, 433.4, 427.4, 419.2],
  devonian: [419.2, 393.3, 382.7, 358.9], permian: [298.9, 273.01, 259.51, 251.9], triassic: [251.9, 247.2, 237, 201.4],
  jurassic: [201.4, 174.7, 161.5, 145], neoproterozoic: [1000, 720, 635, 538.8],
};
// periods in two halves: Early, Late, and a 'Middle' around their boundary
const HALVES = { cretaceous: [[145, 100.5], [125, 83.6], [100.5, 66]], carboniferous: [[358.9, 323.2], [330.9, 315.2], [323.2, 298.9]] };
// the Precambrian periods
Object.assign(P, { siderian: [2500, 2300], rhyacian: [2300, 2050], orosirian: [2050, 1800], statherian: [1800, 1600], calymmian: [1600, 1400],
  ectasian: [1400, 1200], stenian: [1200, 1000] });
// A word to its name on the scale, in English, French, Spanish or Portuguese ('Dévonien', 'Cretácico', 'Arqueano', 'Palaeozoic'): accents
// dropped, palaeo- / -aean folded, then the longest stem the word starts with (a few letters of ending at most)
const STEM = { quatern: "quaternary", neogen: "neogene", paleogen: "paleogene", tertia: "tertiary", tercia: "tertiary", cretac: "cretaceous",
  juras: "jurassic", trias: "triassic", permi: "permian", pennsylvan: "pennsylvanian", mississip: "mississippian", carbonif: "carboniferous",
  devon: "devonian", silur: "silurian", ordovic: "ordovician", cambri: "cambrian", ediacar: "ediacaran", criogen: "cryogenian", cryogen: "cryogenian",
  toni: "tonian", holocen: "holocene", pleistocen: "pleistocene", pliocen: "pliocene", miocen: "miocene", oligocen: "oligocene", eocen: "eocene",
  paleocen: "paleocene", cenozo: "cenozoic", cainozo: "cenozoic", mesozo: "mesozoic", paleozo: "paleozoic", neoproterozo: "neoproterozoic",
  mesoproterozo: "mesoproterozoic", paleoproterozo: "paleoproterozoic", proterozo: "proterozoic", phaneroz: "phanerozoic", hade: "hadean",
  precambri: "precambrian", sideri: "siderian", rhyaci: "rhyacian", riaci: "rhyacian", orosir: "orosirian", stather: "statherian", esteri: "statherian",
  calymm: "calymmian", calimi: "calymmian", ectas: "ectasian", esteni: "stenian", steni: "stenian" };
for (const pre of ["", "neo", "meso", "paleo", "eo"]) for (const s of ["arch", "arcai", "arqu"]) STEM[pre + s] = pre + "archean";
const STEMS = Object.keys(STEM).sort((a, b) => b.length - a.length);
const fold = (w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^palaeo/, "paleo").replace(/aean/, "ean");
const nameOf = (w) => { const f = fold(w); if (f in P) return f; const s = STEMS.find((k) => f.startsWith(k) && f.length - k.length <= 5); return s ? STEM[s] : null; };
const PART = { early: 0, lower: 0, inferieur: 0, inferieure: 0, precoce: 0, inferior: 0, temprano: 0, inicial: 0, middle: 1, mid: 1, moyen: 1, moyenne: 1,
  medio: 1, late: 2, upper: 2, superieur: 2, superieure: 2, tardif: 2, superior: 2, tardio: 2 };

const subOf = (name, k) => {
  const s = SUB[name];
  if (s) return [s[k], s[k + 1]];
  if (HALVES[name]) return HALVES[name][k];
  const [o, y] = P[name], d = (o - y) / 3;
  return [o - k * d, o - (k + 1) * d];
};

// one named age ('Late Devonian', 'Dévonien supérieur', 'Eocene', '350 Ma') as [older, younger] Ma, or null. Early / Middle / Late before
// the name, or after it ('supérieur') when no name follows.
function oneAge(text) {
  const t = String(text || "").toLowerCase().replace(/[()]/g, " ").trim();
  if (!t) return null;
  const num = t.match(/^(\d+(?:\.\d+)?)\s*(ma|ga)?$/);
  if (num) { const v = Number(num[1]) * (num[2] === "ga" ? 1000 : 1); return [v, v]; }
  const words = t.split(/[\s,/]+/).filter(Boolean), items = [];
  let pending = null;
  words.forEach((w, i) => {
    const part = PART[fold(w)];
    if (part != null) {
      if (i + 1 < words.length && nameOf(words[i + 1])) pending = part;
      else if (items.length && items.at(-1).at === i - 1 && items.at(-1).part == null) items.at(-1).part = part;
      return;
    }
    const name = nameOf(w);
    if (name) { items.push({ name, part: pending, at: i }); pending = null; }
  });
  if (!items.length) return null;
  return items.map((it) => (it.part == null ? P[it.name] : subOf(it.name, it.part))).reduce((r, q) => [Math.max(r[0], q[0]), Math.min(r[1], q[1])], [-Infinity, Infinity]);
}

// a written age or range ('Late Devonian to Early Carboniferous', 'Cambrian-Ordovician') as [older, younger] Ma, or null
export function parseAge(text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const parts = t.split(/\s+(?:to|-|–|—)\s+|\s*[–—]\s*|(?<=[a-z])-(?=[A-Za-z])/i).map(oneAge).filter(Boolean);
  if (!parts.length) return null;
  return parts.reduce((r, p) => [Math.max(r[0], p[0]), Math.min(r[1], p[1])], [-Infinity, Infinity]);
}

// The GSC-style leading age codes of a map label ('DvCbT-ss', 'OdSlMH', 'CbF'); a single period letter only when another capital follows
// ('ST'). 'Slats' is a word, not 'Sl' + 'ats': a code is followed by a capital, a digit, a hyphen or the end.
const CODES = { Q: "quaternary", Ng: "neogene", Pg: "paleogene", T: "tertiary", Kr: "cretaceous", Jr: "jurassic", Tr: "triassic", Pm: "permian",
  Pn: "pennsylvanian", Ms: "mississippian", Cb: "carboniferous", Dv: "devonian", Sl: "silurian", Od: "ordovician", Cm: "cambrian",
  Pz: "paleozoic", Mz: "mesozoic", Cz: "cenozoic", Pt: "proterozoic", Ar: "archean" };
const ONE = { Q: "quaternary", K: "cretaceous", J: "jurassic", P: "permian", C: "carboniferous", D: "devonian", S: "silurian", O: "ordovician", T: "tertiary" };
export function labelAge(label) {
  const s = String(label ?? "").trim();
  const names = [];
  let i = 0;
  let q = false;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (CODES[two] && two.length === 2 && /^[a-z]$/.test(two[1])) { names.push(CODES[two]); i += 2; continue; }
    // Quaternary is one capital, its rock letters after it in lower case ('Q', 'Qal', 'Qg', 'NgQ'); 'Qu...' is a word (Quartzite, Queen)
    if (s[i] === "Q" && !/^u/i.test(s[i + 1] || "")) { names.push("quaternary"); q = true; break; }
    break;
  }
  if (names.length && !q && i < s.length && !/[A-Z0-9-]/.test(s[i])) return null; // a word that starts like a code
  if (!names.length && ONE[s[0]] && /^[A-Z]$/.test(s[1] || "")) names.push(ONE[s[0]]);
  if (!names.length) return null;
  return { range: names.reduce((r, n) => [Math.max(r[0], P[n][0]), Math.min(r[1], P[n][1])], [-Infinity, Infinity]), text: [...new Set(names)].map((n) => n[0].toUpperCase() + n.slice(1)).join(" – ") };
}

// The map's age fields, by name: a max / min pair, or age fields (era, period, epoch ...: the narrowest reading is taken); a label field
const AGE_FIELD = /^(age|era|ere|period|periode|periodo|epoch|epoque|epoca|edad|idade|geol[_ ]?age|strat[_ ]?age)$/i;
export function ageFields(fields) {
  const f = fields || [];
  const find = (re) => f.find((x) => re.test(String(x))) || null;
  return {
    ages: f.filter((x) => AGE_FIELD.test(String(x))),
    max: find(/^(max|old|oldest|from|start|early)[_ ]?age$|^age[_ ]?(max|old|oldest|from|start)$/i),
    min: find(/^(min|young|youngest|to|end|late)[_ ]?age$|^age[_ ]?(min|young|youngest|to|end)$/i),
    age: find(AGE_FIELD),
    label: find(/^(label|symbol|map[_ ]?sym(bol)?|unit[_ ]?sym(bol)?|sym)$/i),
  };
}

const MEMBER = [[/\bupper\b|\btop\b/i, 0], [/\bmiddle\b/i, 1], [/\blower\b|\bbasal\b|\bbase\b/i, 2]];
// the formation a unit belongs to ('Tuttle Fm - shale unit' -> 'tuttle fm'), and its member place when it is one; a comma is not a split
// ('Rhyolite massive, localement ...' is a description)
const SPLIT = /\s+[-–—]\s+/;
const stemOf = (u) => { const m = String(u).split(SPLIT); return m.length > 1 ? m[0].trim().toLowerCase() : null; };
const memberOf = (u) => { const rest = String(u).split(SPLIT).slice(1).join(" "); for (const [re, k] of MEMBER) if (re.test(rest)) return k; return null; };
const overlap = (a, b) => a[0] > b[1] && b[0] > a[1];
const mode = (vals) => { const n = new Map(); for (const v of vals) n.set(v, (n.get(v) || 0) + 1); let best = null, k = 0; for (const [v, c] of n) if (c > k) { best = v; k = c; } return best; };

// Each unit's age from the layer: { unit: { range: [older, younger] Ma, text, from: "fields" | "label" } }; units with none are absent.
// Per unit, the most common value over its features (a blank one is no value). A field age and a label code that do not overlap: the
// label, which is what the map shows; when they overlap, the narrower. Facies of one formation share its narrowest age.
export function unitAges(layer, field, units) {
  const feats = layer?.features || [];
  const fields = layer?.fields || Object.keys(feats[0]?.attributes || {});
  const af = ageFields(fields);
  if (!af.max && !af.min && !af.age && !af.label) return {};
  const byUnit = new Map();
  for (const f of feats) {
    const a = f.attributes || {}, u = a[field];
    if (u == null || u === "") continue;
    const k = String(u);
    if (!byUnit.has(k)) byUnit.set(k, { ages: [], labels: [] });
    const e = byUnit.get(k);
    const mx = af.max ? String(a[af.max] ?? "").trim() : "", mn = af.min ? String(a[af.min] ?? "").trim() : "";
    let one = "", w = Infinity;
    for (const k of af.ages) { const t = String(a[k] ?? "").trim(), r = t && parseAge(t); if (r && r[0] - r[1] < w) { one = t; w = r[0] - r[1]; } }
    const txt = mx || mn ? (mx && mn && mx !== mn ? `${mx} – ${mn}` : mx || mn) : one;
    if (txt) e.ages.push(txt);
    if (af.label && a[af.label] != null && String(a[af.label]).trim()) e.labels.push(String(a[af.label]).trim());
  }
  // a label field counts when most of its labels read as age codes (a 'label' of plain names is not one)
  const allLabels = [...byUnit.values()].map((e) => mode(e.labels)).filter(Boolean);
  const labelsRead = allLabels.length > 0 && allLabels.filter((l) => labelAge(l)).length * 2 >= allLabels.length;
  const out = {};
  for (const [u, e] of byUnit) {
    if (units && !units.includes(u)) continue;
    const txt = mode(e.ages), fr = txt ? parseAge(txt) : null;
    const lab = labelsRead ? labelAge(mode(e.labels)) : null;
    if (fr && lab && !overlap(fr, lab.range)) out[u] = { range: lab.range, text: lab.text, from: "label" };
    else if (fr && lab) out[u] = fr[0] - fr[1] <= lab.range[0] - lab.range[1] ? { range: fr, text: txt, from: "fields" } : { range: lab.range, text: lab.text, from: "label" };
    else if (fr) out[u] = { range: fr, text: txt, from: "fields" };
    else if (lab) out[u] = { range: lab.range, text: lab.text, from: "label" };
  }
  // one formation's units take its narrowest age when it overlaps all of theirs
  const stems = new Map();
  for (const u of Object.keys(out)) { const s = stemOf(u); if (s) stems.set(s, [...(stems.get(s) || []), u]); }
  for (const us of stems.values()) {
    if (us.length < 2) continue;
    const nar = us.map((u) => out[u]).sort((a, b) => (a.range[0] - a.range[1]) - (b.range[0] - b.range[1]))[0];
    if (us.every((u) => overlap(nar.range, out[u].range) || nar.range[0] === out[u].range[0])) for (const u of us) out[u] = { ...out[u], range: nar.range, text: nar.text };
  }
  // a unit of the formation with no age of its own takes the formation's
  for (const u of units || []) {
    const s = stemOf(u);
    if (out[u] || !s) continue;
    const kin = Object.keys(out).find((v) => stemOf(v) === s);
    if (kin) out[u] = { ...out[kin], from: out[kin].from };
  }
  return out;
}

const mid = (r) => (r[0] + r[1]) / 2;
// one package needs an age of about a period or finer: two units both 'Paleoproterozoic' are not known to be one age
const PACKAGE_MAX_MYR = 100;
const sameAge = (a, b) => Math.abs(a.range[0] - b.range[0]) < 1e-6 && Math.abs(a.range[1] - b.range[1]) < 1e-6;

// The order by the map's ages, youngest first: { order, dated, total, use }. Dated units are sorted into the places dated units hold in
// the bedding order; an undated one keeps its own place. Same age: members upper > middle > lower, otherwise the bedding order.
// use: most units dated (and at least two), so the age order is the suggestion.
export function ageOrder(beddingOrder, ages) {
  const base = beddingOrder || [];
  const dated = base.filter((u) => ages?.[u]);
  const pos = new Map(base.map((u, i) => [u, i]));
  const sorted = dated.slice().sort((a, b) => {
    const A = ages[a], B = ages[b];
    if (!sameAge(A, B)) return mid(A.range) - mid(B.range) || A.range[1] - B.range[1];
    const sa = stemOf(a), ma = memberOf(a), mb = memberOf(b);
    if (sa && sa === stemOf(b) && ma != null && mb != null && ma !== mb) return ma - mb;
    return pos.get(a) - pos.get(b);
  });
  let k = 0;
  const order = base.map((u) => (ages?.[u] ? sorted[k++] : u));
  return { order, dated: dated.length, total: base.length, use: dated.length >= 2 && dated.length * 2 > base.length };
}

// Facies of one formation and one age ('Sand Fm - sandstone', 'Sand Fm - shale'; not its upper / lower members): groups of two or more.
// Where they meet on the map the boundary is lateral, not a top: Model from map leaves those contacts out.
export function faciesGroups(order, ages) {
  const g = new Map();
  for (const u of order || []) {
    const s = stemOf(u);
    if (!s || memberOf(u) != null || !ages?.[u]) continue;
    const k = `${s}|${ages[u].range[0]}|${ages[u].range[1]}`;
    g.set(k, [...(g.get(k) || []), u]);
  }
  return [...g.values()].filter((x) => x.length > 1);
}

// Erosional over same-age units: each run of same-age neighbours in the order is one conformable package and each package truncates the
// ones below (a 'break' under the last unit of each run). Two facies of one age side by side share their contacts, and as two erosional
// series those contacts made GemPy's matrix singular. Returns the units with a break below them, or null when no two neighbours share an
// age (plain Erosional then). Members of one formation are separate ages here.
export function sameAgeBreaks(order, ages) {
  const o = order || [];
  const same = (a, b) => ages?.[a] && ages?.[b] && sameAge(ages[a], ages[b]) && ages[a].range[0] - ages[a].range[1] <= PACKAGE_MAX_MYR && !(stemOf(a) && stemOf(a) === stemOf(b) && memberOf(a) != null && memberOf(b) != null && memberOf(a) !== memberOf(b));
  let any = false;
  const out = [];
  for (let i = 0; i < o.length - 1; i++) { if (same(o[i], o[i + 1])) any = true; else out.push(o[i]); }
  return any ? out : null;
}
