// TASKS.csv #3611 / #3612 (Fireweed rehearsal round 3; Matt: "yes with a title field") — after Save and reopen the sheet title and the title block's Project
// row printed the file's name where they had printed 'Macpass zinc-lead-silver (sample)': #199 makes project.name the file's name. The project now keeps an
// optional `title`: set once on the first save of a project that already has a name, never overwritten by a rename or a later save, editable in Layout
// ('Project title'); {project}, the sheet title and the PDF's title read it first; a project with none reads its name (the file's), as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectTitleOf, titleToKeep, withProjectTitle } from "../src/lib/projectTitle.js";
import { fieldsFromPayload, payloadFromFields } from "../src/lib/projectFields.js";
import { documentTitle } from "../src/lib/layoutTitleBlock.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SAMPLE = "Macpass zinc-lead-silver (sample)";

test("what a sheet prints: the title when there is one, else the name (the file's)", () => {
  assert.equal(projectTitleOf({ name: "macpass_g3_p592", title: SAMPLE }), SAMPLE);
  assert.equal(projectTitleOf({ name: "wairon" }), "wairon"); // an older project: no title, as before
  assert.equal(projectTitleOf({ name: "wairon", title: "   " }), "wairon");
  assert.equal(projectTitleOf(null), "");
});

test("first save: a sample's (or a typed) name is kept as the title; never over an existing title, a file's own name or the blank default", () => {
  assert.equal(titleToKeep({ name: SAMPLE }, { hadFile: false }), SAMPLE);
  assert.equal(titleToKeep({ name: SAMPLE, title: "My title" }, { hadFile: false }), null); // a rename / a later save never overwrites
  assert.equal(titleToKeep({ name: "macpass_g3_p592" }, { hadFile: true }), null); // an opened or already saved file: its name is the file's
  assert.equal(titleToKeep({ name: "Untitled project" }, { hadFile: false }), null);
  assert.equal(titleToKeep({ name: "" }, { hadFile: false }), null);
});

test("the editable field: typed as it is (spaces kept while typing), blank removes it, an unchanged value is the same object", () => {
  const p = { name: "f", epsg: 1 };
  const a = withProjectTitle(p, "Macpass ");
  assert.equal(a.title, "Macpass "); assert.equal(projectTitleOf(a), "Macpass"); // trimmed where it is read
  assert.equal(withProjectTitle(a, "Macpass "), a);
  const b = withProjectTitle(a, "  "); assert.ok(!("title" in b)); assert.equal(projectTitleOf(b), "f");
  assert.equal(withProjectTitle(p, ""), p);
});

test("save, rename on disk, reopen: the title survives and the name follows the file", () => {
  // first save of the sample: the file written carries the title (the name in it is replaced by the file's on open, #199)
  const live = { ...fieldsFromPayload({ project: { name: SAMPLE, epsg: 26909 } }, null, []) };
  const kept = titleToKeep(live.project, { hadFile: false });
  const written = payloadFromFields({ ...live, project: withProjectTitle(live.project, kept) });
  assert.equal(written.project.title, SAMPLE);
  // reopened under the file's name, then the file renamed on disk and opened again
  const reopened = fieldsFromPayload(JSON.parse(JSON.stringify(written)), "macpass_g3_p592", []);
  assert.equal(reopened.project.name, "macpass_g3_p592"); assert.equal(reopened.project.title, SAMPLE);
  assert.equal(projectTitleOf(reopened.project), SAMPLE);
  const renamed = fieldsFromPayload(JSON.parse(JSON.stringify(payloadFromFields(reopened))), "renamed on disk", []);
  assert.equal(renamed.project.name, "renamed on disk"); assert.equal(projectTitleOf(renamed.project), SAMPLE);
  // a second save of the reopened project (it has a file now) keeps the title and captures nothing new
  assert.equal(titleToKeep(renamed.project, { hadFile: true }), null);
});

test("an old project without a title, and an autosave recovery", () => {
  const old = fieldsFromPayload({ project: { name: "stale name in the file", epsg: 3156 } }, "wairon", []);
  assert.equal(old.project.title, undefined); assert.equal(projectTitleOf(old.project), "wairon");
  assert.equal(titleToKeep(old.project, { hadFile: true }), null); // a project opened from a file never captures its file's name as a title
  // the crash-recovery snapshot is the same payload (no file name given): the title in it is restored
  const snap = JSON.parse(JSON.stringify(payloadFromFields({ ...old, project: withProjectTitle(old.project, "Typed title") })));
  const restored = fieldsFromPayload(snap, null, []);
  assert.equal(restored.project.title, "Typed title"); assert.equal(projectTitleOf(restored.project), "Typed title");
  assert.equal(fieldsFromPayload({}, null, []).project.title, undefined); // a new project
});

test("the PDF's title and the sheet's {project} read it", () => {
  assert.equal(documentTitle([{ elements: [] }], { name: "file name", title: SAMPLE }), SAMPLE);
  assert.equal(documentTitle([{ elements: [{ type: "title", text: "A sheet" }] }], { name: "file name", title: SAMPLE }), "A sheet"); // a typed sheet title still wins
  assert.equal(documentTitle([{ elements: [] }], { name: "file name" }), "file name");
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /return \{ gridCaption, project: projectTitleOf\(project\), date:/);
  assert.match(l, /onChange=\{\(e\) => setProjectTitle\(e\.target\.value\)\}/);
});

test("wired in the store: kept in the file written by the first save, and in the live project", () => {
  const s = read("../src/lib/store.jsx");
  assert.match(s, /keptTitle = titleToKeep\(liveRef\.current\.project, \{ hadFile: !!workspaceTabs\.find\(\(t\) => t\.id === activeTabId\)\?\.filePath \}\);/);
  assert.match(s, /projectPartsSliced\(keptTitle \? \{ \.\.\.liveRef\.current, project: withProjectTitle\(liveRef\.current\.project, keptTitle\) \} : liveRef\.current\)/);
  assert.match(s, /setProject\(\(p\) => \(\{ \.\.\.withProjectTitle\(p, keptTitle \|\| p\.title\), name: displayName \}\)\)/);
  assert.match(s, /const setProjectTitle = useCallback\(\(title\) => setProject\(\(p\) => withProjectTitle\(p, title\)\), \[\]\);/);
  for (const k of ["Project title", "Printed as {project} on every sheet (title and title block) and as the PDF's title. Blank: the file's name; saving or renaming the file does not change it."])
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 30)}`);
});
