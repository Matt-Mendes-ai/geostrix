// TASKS.csv #1966 — the offline help pages and their search. Loaded with the Help panel (HelpPane.jsx, a lazy chunk), never at
// startup; bundled with the app, no fetch.
//
// A page is a plain object:
//   { id,                       // the id src/lib/help.js PANE_HELP points at (kebab-case)
//     area,                     // one of HELP_AREAS (src/lib/help.js)
//     title,                    // the pane's English title, so the interface's translation of it can be shown
//     summary,                  // what the tool does, in two to four plain sentences
//     notFor: [string],         // what it is not, or what to use instead ("A UBC model CSV is not survey data: ...")
//     fields: [{ name, what, choose }],  // each control by its on-screen label: what it means, and HOW TO CHOOSE a value
//                                       //   (never a number that reads as the right answer for every project)
//     warnings: [{ says, means, do }],   // a message the tool can show (as on screen, placeholders as {n}), what it means, what to do
//     howto: { sample, steps: [string] }, // a short numbered walk-through on a sample project ("Woodjam", "Silvertip", ...)
//     related: [id] }           // other pages
// Text rules: Canadian spelling (colour, centre, metre, modelling; -ize), no backlog numbers, plain words, the labels exactly as the
// interface shows them. English for now; the interface's own labels are translated where the panel shows them.
import start from "./pages/start.js";
import geophysics from "./pages/geophysics.js";
import maps from "./pages/maps.js";
import mineDesign from "./pages/mineDesign.js";
import modelling from "./pages/modelling.js";
import view from "./pages/view.js";
import surface from "./pages/surface.js";
import targeting from "./pages/targeting.js";

export const PAGES = [...start, ...geophysics, ...maps, ...mineDesign, ...modelling, ...view, ...surface, ...targeting];
export const pageById = (id) => PAGES.find((p) => p.id === id) || null;

// every searchable string of a page, lower-cased, computed once
const textCache = new Map();
function pageText(p) {
  let t = textCache.get(p.id);
  if (t) return t;
  const body = [
    ...(p.notFor || []),
    ...(p.fields || []).flatMap((f) => [f.name, f.what, f.choose]),
    ...(p.warnings || []).flatMap((w) => [w.says, w.means, w.do]),
    ...(p.howto?.steps || []),
  ].filter(Boolean).join(" \n ");
  t = { title: String(p.title || "").toLowerCase(), summary: String(p.summary || "").toLowerCase(), body: body.toLowerCase(), raw: body };
  textCache.set(p.id, t);
  return t;
}
const count = (hay, needle) => { let n = 0, i = hay.indexOf(needle); while (i >= 0) { n++; i = hay.indexOf(needle, i + needle.length); } return n; };

// Plain search: every word must appear somewhere in the page; a word in the title counts most, then the summary, then the body.
// -> [{ page, score, snippet }] best first
export function searchPages(query, pages = PAGES) {
  const words = String(query || "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}./%+-]/gu, "")).filter((w) => w.length > 1);
  if (!words.length) return [];
  const out = [];
  for (const p of pages) {
    const t = pageText(p);
    let score = 0, all = true;
    for (const w of words) {
      const s = 6 * count(t.title, w) + 3 * count(t.summary, w) + count(t.body, w);
      if (!s) { all = false; break; }
      score += s;
    }
    if (!all) continue;
    out.push({ page: p, score, snippet: snippetFor(p, words[0]) });
  }
  return out.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title));
}
// the sentence of the page that holds the word (the summary when the word is only in the title)
function snippetFor(p, word) {
  const t = pageText(p);
  const src = t.summary.includes(word) ? String(p.summary) : t.raw;
  const lower = src.toLowerCase(), i = lower.indexOf(word);
  if (i < 0) return String(p.summary || "").slice(0, 160);
  const from = Math.max(0, lower.lastIndexOf(". ", i) + 1), to = lower.indexOf(". ", i);
  const s = src.slice(from, to < 0 ? Math.min(src.length, i + 160) : to + 1).trim();
  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
}
