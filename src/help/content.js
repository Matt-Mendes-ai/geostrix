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
//     howto: { sample, steps: [string], folded }, // a short numbered walk-through on a sample project ("Woodjam", "Silvertip", ...);
//                               // #3899 — folded: true shows it under its heading, closed (counted behind "More")
//     related: [id],            // other pages
//     diagram: { id, alt },     // TASKS.csv #3899 — a picture after the summary (src/help/diagrams), its alt sentence read aloud and by the search
//     more,                     // #3899 — detail kept behind a closed "More" (also on a field or a warning); the search reads it
//     guide,                    // TASKS.csv #3887 — true on the First steps page: its screens (src/help/guide.js) are shown instead of a body, and searched
//     // TASKS.csv #3973 (#3967's plan) — the card shape, src/help/CardPage.jsx: a page with `line` is drawn as a card; the rest of its text goes into folds
//     line,                     // K1: the card's one line, at most 15 words (the summary moves under More)
//     picture: { help | diagram | drop: [ids], alt }, // K1: one of the cards' own pictures (help: diagrams/pictures.jsx, #3978), a Help diagram, or
//                               // one or two style-A block pictures (components/DropDiagram.jsx)
//     figure: { help, alt },    // #3978: a second picture under the key settings, where the plan puts one beside a setting
//     cautions: [string],       // K2: one-line cautions, always in view (a protective one never folds)
//     instead: [{ text, to, page }], // K3: "Use instead" chips; page: a Help page id, when there is one
//     keys: [field name],       // K4: two to four settings in view, each with a `gist` on its field (at most 8 words)
//     strip: [string] }         // K5: a step strip, where the walk-through was in view
// #3899 (plan_fable 3.2): a summary of about 25 words; a field's `what` is the control's own tooltip sentence where it has one; a warning's `means`
// and `do` short (the on-screen message is not repeated); anything longer goes to `more`.
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
import data from "./pages/data.js"; // first project, importing drillholes / assays / density, Data QC
import everyday from "./pages/everyday.js"; // TASKS.csv #3556 / #3578 — the everyday 3D view and the Geochem report tools
import tonnage from "./pages/tonnage.js"; // TASKS.csv #3597 — Grade-tonnage, Block calculator, Unsampled metres
import layout from "./pages/layout.js"; // TASKS.csv #3603 — Layout and the Maps plan view
import output from "./pages/output.js"; // TASKS.csv #3622 — Export, and Save / autosave / recovery / Undo
import { MINE_DESIGN_ENABLED } from "../lib/features.js"; // TASKS.csv #3897
import { FIRST_STEPS } from "./guide.js"; // TASKS.csv #3887

const ALL_PAGES = [...start, ...data, ...everyday, ...output, ...geophysics, ...maps, ...layout, ...mineDesign, ...modelling, ...tonnage, ...view, ...surface, ...targeting];
// TASKS.csv #3897 — with Mine Design switched off its pages are not listed, searched or offered as related pages. pageById still finds
// them, so the switched-off panes' own "?" (and PANE_HELP) keep a page for the day the switch goes back on.
const shownIds = new Set(ALL_PAGES.filter((p) => MINE_DESIGN_ENABLED || p.area !== "Mine Design").map((p) => p.id));
export const PAGES = ALL_PAGES.filter((p) => shownIds.has(p.id))
  .map((p) => (p.related?.some((r) => !shownIds.has(r)) ? { ...p, related: p.related.filter((r) => shownIds.has(r)) } : p));
export const pageById = (id) => PAGES.find((p) => p.id === id) || ALL_PAGES.find((p) => p.id === id) || null;

// every searchable string of a page, lower-cased, computed once
const textCache = new Map();
function pageText(p) {
  let t = textCache.get(p.id);
  if (t) return t;
  const body = [
    ...(p.notFor || []),
    p.diagram?.alt, p.more, // #3899
    p.line, p.picture?.alt, p.figure?.alt /* #3978 */, ...(p.cautions || []), ...(p.instead || []).flatMap((x) => [x.text, x.to]), ...(p.strip || []), ...(p.fields || []).map((f) => f.gist), // #3973
    ...(p.fields || []).flatMap((f) => [f.name, f.what, f.choose, f.more]),
    ...(p.warnings || []).flatMap((w) => [w.says, w.means, w.do, w.more]),
    ...(p.howto?.steps || []),
    ...(p.guide ? FIRST_STEPS.flatMap((s) => [s.title, s.text, s.alt, s.button?.label]) : []), // #3887
  ].filter(Boolean).join(" \n ");
  t = { title: String(p.title || "").toLowerCase(), summary: String(p.summary || "").toLowerCase(), body: body.toLowerCase(), raw: body };
  textCache.set(p.id, t);
  return t;
}
const count = (hay, needle) => { let n = 0, i = hay.indexOf(needle); while (i >= 0) { n++; i = hay.indexOf(needle, i + needle.length); } return n; };

// Plain search: every word must appear somewhere in the page; a word in the title counts most, then the summary, then the body.
// TASKS.csv #3693 (Fireweed rehearsal, round 3) — 'survey' listed seven geophysics pages before Import drillhole data for someone on the 3D View tab:
// opts.area (the tab the user is on, a HELP_AREAS name) doubles the score of that tab's pages and adds 8, so its pages come first for a word they
// match as well, while a page of another tab that matches far better (a title hit against a body mention) still wins.
// -> [{ page, score, snippet }] best first
export function searchPages(query, pages = PAGES, opts = {}) {
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
    out.push({ page: p, score: opts.area && p.area === opts.area ? 2 * score + 8 : score, snippet: snippetFor(p, words[0]) });
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
