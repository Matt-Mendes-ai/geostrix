// TASKS.csv #2163 (WA drillhole review #2148, T15) — a per-project code dictionary: what each logging code of a layer means IN THIS
// PROJECT. The same code means different rocks in different reports (SA, MB, S, M, SMP...), so there is no global code -> rock table:
// each entry is the project's own, filled from the description the file logged beside the code where it has one, and editable.
// Saved with the project as project field `codeDictionary`: { [layerKey]: { [codeKey]: { code, desc, source: "file" | "user" } } }.
// Codes are case-folded (codeKey): "Smp" and "SMP" are one entry; `code` keeps the most used spelling. Pure.

export const codeKey = (code) => String(code ?? "").trim().toLowerCase();

// The descriptions logged beside each code: Map codeKey -> { code (the most used spelling), total (rows with the code), described
// (rows with a description), top (the most used description or null), topN, variants (distinct descriptions), tie (the top is shared) }.
export function loggedDescriptions(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const k = codeKey(r?.value);
    if (!k) continue;
    let e = by.get(k);
    if (!e) by.set(k, (e = { spell: new Map(), desc: new Map(), total: 0, described: 0 }));
    e.total++;
    const raw = String(r.value).trim();
    e.spell.set(raw, (e.spell.get(raw) || 0) + 1);
    const d = String(r.description ?? "").trim().replace(/\s+/g, " ");
    if (d) { e.described++; e.desc.set(d, (e.desc.get(d) || 0) + 1); }
  }
  const out = new Map();
  const most = (m) => [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  for (const [k, e] of by) {
    const d = most(e.desc);
    out.set(k, {
      code: most(e.spell)[0][0], total: e.total, described: e.described,
      top: d[0]?.[0] ?? null, topN: d[0]?.[1] ?? 0, variants: d.length, tie: d.length > 1 && d[0][1] === d[1][1],
    });
  }
  return out;
}

// A description the file gives for the code without ambiguity: the only one logged, or the most used one when it is used on more
// than one row and not tied. Free-text notes that differ on every row (each used once) give none: they describe intervals, not the code.
// TASKS.csv #3206 (#3195, Galore Creek) — opts.freeText: the file's description column is the geologist's note on each interval (938 of 1,114
// filled, all different), not a code legend. A code then takes a meaning only when the same text repeats on most of its described rows; a code
// logged once (OVB = 'Sonic hole; OVB intersected.', V3 = a 30-word note) takes none.
export function fileDescriptionOf(info, { freeText = false } = {}) {
  if (!info?.top) return null;
  if (freeText) return info.topN >= 2 && info.topN * 2 >= info.described && !info.tie ? info.top : null;
  if (info.variants === 1) return info.top;
  return info.topN >= 2 && !info.tie ? info.top : null;
}
// #3206 — a description column that is free text: at least 20 described rows (enough to judge), more than half of their texts different
export function descriptionsAreFreeText(rows) {
  let described = 0;
  const distinct = new Set();
  for (const r of rows || []) { const d = String(r?.description ?? "").trim().replace(/\s+/g, " "); if (d) { described++; distinct.add(d); } }
  return described >= 20 && distinct.size * 2 > described;
}

// The layer's dictionary with an entry added for each code that has none yet and an unambiguous description in rows.
// Entries already there (from the file or typed) are never replaced. -> { dict (the same object when nothing was added), added }
export function fillFromRows(dict, rows) {
  const base = dict && typeof dict === "object" ? dict : {};
  const add = {};
  const freeText = descriptionsAreFreeText(rows); // #3206
  for (const [k, info] of loggedDescriptions(rows)) {
    if (base[k]) continue;
    const desc = fileDescriptionOf(info, { freeText });
    if (desc) add[k] = { code: info.code, desc, source: "file" };
  }
  const added = Object.keys(add).length;
  return { dict: added ? { ...base, ...add } : dict || {}, added };
}

// One entry typed by the user; a blank description removes the entry (the code then has no meaning recorded).
export function setEntry(dict, code, desc) {
  const k = codeKey(code);
  const base = dict && typeof dict === "object" ? dict : {};
  if (!k) return base;
  const d = String(desc ?? "").trim().replace(/\s+/g, " ");
  if (!d) { if (!base[k]) return base; const { [k]: _gone, ...rest } = base; return rest; }
  if (base[k]?.desc === d) return base;
  return { ...base, [k]: { code: base[k]?.code ?? String(code).trim(), desc: d, source: "user" } };
}

// The entry for one of the layer's codes, or null.
export const entryOf = (dict, code) => (dict && dict[codeKey(code)]) || null;

// The legend labels the dictionary gives the layer's codes ([value, count] pairs, as distinctValues returns): [{ value, label }] for the
// codes with an entry whose description differs from the label they have now (labelOf(value)).
export function labelsFromDictionary(dict, categories, labelOf = () => "") {
  const out = [];
  for (const [value] of categories || []) {
    const e = entryOf(dict, value);
    if (e?.desc && e.desc !== labelOf(value)) out.push({ value, label: e.desc });
  }
  return out;
}
