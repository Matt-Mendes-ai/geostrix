// TASKS.csv #3887 (Text and Help batch, T5) — the First steps guide: six screens of at most 40 words, each with a diagram that exists and
// (but one) a button that runs a route the app really has; every string translated; the Macpass screen carries Fireweed's credit; the model
// screen keeps "not a resource estimate"; the page is in Help and found by its search; three doors open it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FIRST_STEPS, FIRST_STEPS_ID } from "../src/help/guide.js";
import { PAGES, searchPages } from "../src/help/content.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const LANGS = ["es", "pt", "fr", "ar"].map((l) => [l, JSON.parse(read(`src/locales/${l}.json`))]);

test("six screens, each at most 40 words, about 250 in all", () => {
  assert.equal(FIRST_STEPS.length, 6);
  for (const s of FIRST_STEPS) assert.ok(words(s.text) <= 40, `${s.title}: ${words(s.text)} words`);
  const total = FIRST_STEPS.reduce((t, s) => t + words(s.title) + words(s.text) + (s.button ? words(s.button.label) : 0), 0);
  assert.ok(total <= 280, `${total} words`);
});

test("each screen's diagram is one of the Help diagrams; five buttons, each on a route the app has", () => {
  const diagrams = read("src/help/diagrams/index.jsx").match(/export const DIAGRAMS = \{([^}]*)\}/)[1].split(",").map((x) => x.split(":")[0].trim());
  for (const s of FIRST_STEPS) assert.ok(diagrams.includes(s.diagram), s.diagram);
  assert.equal(FIRST_STEPS.filter((s) => s.button).length, 5);
  const app = read("src/App.jsx"), fsx = read("src/help/FirstSteps.jsx");
  for (const { button } of FIRST_STEPS.filter((s) => s.button)) {
    const a = button.act;
    if (a === "start") { assert.match(fsx, /act === "start"\) requestModuleAction\("open-start-dialog"\)/); assert.match(app, /useModuleAction\(\["open-start-dialog"\]/); }
    else if (a === "guided") { assert.match(fsx, /menu\("module-viewer"\); requestModuleAction\("guided-open", \{ tool: "start" \}\)/); assert.match(read("src/modules/ViewerModule.jsx"), /useModuleAction\(\["guided-open"\]/); }
    else if (a.startsWith("module-")) assert.match(app, /if \(action\.startsWith\("module-"\)\)/);
    else if (a.startsWith("sample:")) { assert.match(app, /action\.startsWith\("sample:"\)/); assert.match(read("electron/main.js"), new RegExp(`"menu", "${a}"`)); }
    else assert.ok(app.includes(`action === "${a}"`), a);
  }
  assert.match(read("src/lib/desktop.js"), /window\.addEventListener\("geostrix-menu-gesture", onGesture\)/); // the menu's own route
});

test("every string is translated in es / pt / fr / ar", () => {
  const keys = FIRST_STEPS.flatMap((s) => [s.title, s.text, s.alt, s.button?.label]).filter(Boolean);
  keys.push("First steps", "Guide", "Screen {i} of {n}", "Your logs", "One question", "A model", "New here? First steps, in six screens",
    "New here? First steps shows the everyday path in six screens.", PAGES.find((p) => p.id === FIRST_STEPS_ID).summary);
  for (const [l, d] of LANGS) for (const k of keys) assert.ok(d[k], `${l}: ${k}`);
});

test("the Macpass screen shows Fireweed's credit, and the model screen says it is not a resource estimate", () => {
  for (const s of FIRST_STEPS) if (/Macpass/.test(s.text) || s.button?.act === "sample:yk_macpass") assert.equal(s.credit, "macpass", s.title);
  assert.match(read("src/help/FirstSteps.jsx"), /s\.credit === "macpass" && <div data-guide-credit="" lang="en" dir="auto" [^>]*>\{MACPASS_CREDIT\}<\/div>/); // as Fireweed wrote it, in its own direction in Arabic
  assert.match(read("src/lib/sampleCredits.js"), /Fireweed Metals Corp\./);
  assert.ok(FIRST_STEPS.some((s) => s.diagram === "buildModel" && /not a resource estimate/.test(s.text)));
});

test("the page is in Help, first under Getting started, and its screens are searched", () => {
  const i = PAGES.findIndex((p) => p.id === FIRST_STEPS_ID);
  assert.ok(i >= 0 && PAGES[i].guide && PAGES[i].area === "Getting started");
  assert.equal(PAGES.filter((p) => p.area === "Getting started")[0].id, FIRST_STEPS_ID);
  assert.equal(searchPages("green tabs and blue tabs")[0]?.page.id, FIRST_STEPS_ID);
  assert.match(read("src/components/HelpPane.jsx"), /\{page\.guide && <FirstSteps \/>\}/);
});

test("three doors open it: the Help front page, the start dialogs' last card, the empty 3D view", () => {
  assert.match(read("src/components/HelpPane.jsx"), /data-first-steps-open="" [^>]*onClick=\{\(\) => onOpen\("first-steps"\)\}/);
  assert.match(read("src/components/StartDialogs.jsx"), /data-start-guide="" onClick=\{\(\) => openHelp\("first-steps"\)\}/);
  assert.match(read("src/modules/viewer/EmptyViewerBody.jsx"), /data-first-steps-open="" onClick=\{\(\) => openHelp\("first-steps"\)\}/);
});

test("Help's English bodies keep their own direction in an Arabic interface (dir=auto blocks, ltr runs)", () => {
  const h = read("src/components/HelpPane.jsx");
  assert.match(h, /const EN = \{ lang: "en", dir: "auto" \};/);
  assert.match(h, /const En = \(\{ children \}\) => <span lang="en" dir="ltr">\{children\}<\/span>;/);
  for (const re of [/<p \{\.\.\.EN\} [^>]*>\{page\.summary\}<\/p>/, /<dt \{\.\.\.EN\}/, /<div \{\.\.\.EN\}>\{f\.what\}<\/div>/, /<En>\{f\.choose\}<\/En>/, /<En>\{w\.do\}<\/En>/, /<div \{\.\.\.EN\} style=\{\{ marginTop: 2 \}\}>\{text\}<\/div><\/details>/]) assert.match(h, re);
  assert.match(h, /page\.guide \? <p [^>]*>\{tr\(page\.summary\)\}<\/p>/); // the guide is translated: it follows the interface
});
