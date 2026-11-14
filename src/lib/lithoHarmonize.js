// TASKS.csv #2004 (design docs/ideas/litho-code-harmonization.md; Main's decision 2026-11-14: our own list of about 150 rock names, no download) —
// Lithology codes from many logging systems (BAS, Bslt, Basalt, Dolerite, DIAB) proposed into the project's groups from their MEANING. A
// proposal only: nothing is applied here and nothing is ever written without the user's tick. Pure; the UI is a lazy box in the Lithology groups pane.
//
// What a code means, in this order:
//   1. the project's dictionary entry (#2163: the description logged beside the code, or the user's own)   -> source "dictionary"
//   2. the code itself read as a rock word (Dolerite, basalt, Andesitic)                                    -> source "name"
//   3. the code as a common abbreviation (BAS, GWK, QTZ), only where one rock owns it                       -> source "abbreviation"
// A meaning that matches no rock name is left alone ("not recognized"). Matching is our own: exact names, synonyms, then a bounded
// Levenshtein distance on words of 5 letters or more (a typo or a spelling variant: 'basalte', 'andesit'), which always starts unticked.
import { tablesOf } from "./lithoThesaurus.js";
import { loggedDescriptions, entryOf, codeKey } from "./codeDictionary.js";
import { leadOf } from "./lithoPatterns.js";

// the edit distance of two words, stopping above `max` (-> max + 1)
export function editDistance(a, b, max = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v; if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const maxFor = (len) => (len >= 8 ? 2 : len >= 5 ? 1 : 0);
const clean = (s) => String(s ?? "").toLowerCase().replace(/[^a-z\s]+/g, " ").replace(/\s+/g, " ").trim();

// text -> { rock, family, how: "exact" | "synonym" | "fuzzy", distance, word } | null. English rock names put the noun last
// ('basaltic andesite' is an andesite): phrases first (longest), then single words from the last backwards.
export function matchRock(text, { fuzzy = true } = {}) {
  const T = tablesOf();
  const toks = clean(text).split(" ").filter(Boolean);
  if (!toks.length) return null;
  for (let end = toks.length; end > 0; end--) {
    for (let n = Math.min(T.maxPhrase, end); n >= 1; n--) {
      const hit = T.words.get(toks.slice(end - n, end).join(" "));
      if (hit) return { rock: hit.rock, family: hit.family, how: hit.how, distance: 0, word: toks.slice(end - n, end).join(" ") };
    }
  }
  if (!fuzzy) return null;
  for (let i = toks.length - 1; i >= 0; i--) {
    const w = toks[i], max = maxFor(w.length);
    if (!max) continue;
    let best = null, tie = false;
    for (const k of T.long) {
      const d = editDistance(w, k, max);
      if (d > max) continue;
      const hit = T.words.get(k);
      if (!best || d < best.distance) { best = { rock: hit.rock, family: hit.family, how: "fuzzy", distance: d, word: k }; tie = false; }
      else if (d === best.distance && hit.rock !== best.rock) tie = true;
    }
    if (best && !tie) return best;
  }
  return null;
}

// one code's meaning -> { rock, family, source, how, distance, meaning, others: [rock, ...] } | null
export function meaningOf(code, { dictDesc = null, descriptions = [] } = {}) {
  const T = tablesOf();
  const fromText = (text, source) => { const m = matchRock(leadOf(text) || text); return m ? { ...m, source, meaning: String(text).trim() } : null; };
  let out = null;
  if (dictDesc) out = fromText(dictDesc, "dictionary");
  if (!out) { const w = matchRock(code); if (w) out = { ...w, source: "name", meaning: String(code).trim() }; }
  if (!out) { const a = T.abbr.get(String(code ?? "").trim().toUpperCase()); if (a) out = { rock: a.rock, family: a.family, source: "abbreviation", how: "abbreviation", distance: 0, meaning: String(code).trim() }; }
  if (!out) return null;
  // the same code logged with descriptions that name different rocks (#2163's tie / variants): both meanings are listed, the proposal unticked
  const rocks = new Set();
  for (const d of descriptions) { const m = matchRock(leadOf(d) || d, { fuzzy: false }); if (m) rocks.add(m.rock); }
  rocks.delete(out.rock);
  return { ...out, others: [...rocks] };
}

// rows: litho intervals { value, description? }; groups: the project's [{ id, name, codes }]; dict: the layer's code dictionary (#2163) or null
// -> { proposals: [{ code, total, rock, family, groupId (an existing group) | null, groupName, source, how, distance, meaning, others, tick }],
//      alone: [{ code, total, rock }] (a rock only one code names, and no group holds it: nothing to harmonize),
//      unrecognized: [{ code, total }] }, each largest first. Codes already in a group are not proposed again.
export function suggestGroups(rows, groups = [], dict = null) {
  const inGroup = new Set((groups || []).flatMap((g) => g.codes || []));
  const counts = new Map(), descs = new Map();
  for (const r of rows || []) {
    const c = r?.value == null ? "" : String(r.value).trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
    const d = String(r.description ?? "").trim();
    if (d) (descs.get(c) || descs.set(c, new Set()).get(c)).add(d);
  }
  // an existing group holds a rock when its name is one, or any of its codes means one
  const logged = loggedDescriptions(rows);
  const dictOf = (c) => entryOf(dict, c)?.desc || logged.get(codeKey(c))?.top || null;
  const holders = (groups || []).map((g) => {
    const rocks = new Set(), n = matchRock(g.name, { fuzzy: false });
    if (n) rocks.add(n.rock);
    for (const c of g.codes || []) { const m = meaningOf(c, { dictDesc: dictOf(c) }); if (m && m.how !== "fuzzy") rocks.add(m.rock); }
    return { g, rocks };
  });
  const found = [];
  const unrecognized = [];
  for (const [code, total] of counts) {
    if (inGroup.has(code)) continue;
    const m = meaningOf(code, { dictDesc: dictOf(code), descriptions: [...(descs.get(code) || [])].slice(0, 12) });
    if (m) found.push({ code, total, ...m }); else unrecognized.push({ code, total });
  }
  const byRock = new Map();
  for (const f of found) (byRock.get(f.rock) || byRock.set(f.rock, []).get(f.rock)).push(f);
  const proposals = [], alone = [];
  for (const [rock, list] of byRock) {
    const hold = holders.filter((h) => h.rocks.has(rock)).sort((a, b) => (b.g.codes || []).length - (a.g.codes || []).length)[0];
    if (!hold && list.length < 2) { alone.push({ code: list[0].code, total: list[0].total, rock }); continue; }
    for (const f of list) {
      const sure = f.how !== "fuzzy" && !f.others.length;
      proposals.push({ code: f.code, total: f.total, rock, family: f.family, groupId: hold ? hold.g.id : null, groupName: hold ? hold.g.name : rock, source: f.source, how: f.how, distance: f.distance, word: f.word || null, meaning: f.meaning, others: f.others, tick: sure });
    }
  }
  const big = (a, b) => b.total - a.total || a.code.localeCompare(b.code);
  proposals.sort((a, b) => a.groupName.localeCompare(b.groupName) || big(a, b));
  return { proposals, alone: alone.sort(big), unrecognized: unrecognized.sort(big) };
}

// the ticked proposals -> what to do to the groups: { adds: [{ name, codes }] (new groups), extends: [{ id, codes }] (codes to add to a group) }
export function groupingPlan(proposals) {
  const adds = new Map(), ext = new Map();
  for (const p of proposals || []) {
    if (p.groupId) (ext.get(p.groupId) || ext.set(p.groupId, []).get(p.groupId)).push(p.code);
    else (adds.get(p.groupName) || adds.set(p.groupName, []).get(p.groupName)).push(p.code);
  }
  return { adds: [...adds].map(([name, codes]) => ({ name, codes })), extends: [...ext].map(([id, codes]) => ({ id, codes })) };
}
