// TASKS.csv #3527 — the data owner's credit (project.dataCredit, kept with the project) stays visible on the open project and prints on the default Layout page.
// Before: it showed once, in the notice that opens the sample; after a save and reopen it was nowhere, and the default page printed it only if the user typed {credits}.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_LAYOUT_ELEMENTS, fieldsFromPayload } from "../src/lib/projectFields.js";
import { projectCredits } from "../src/lib/credits.js";
import { MACPASS_CREDIT } from "../src/lib/sampleCredits.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the starter Layout page has a {credits} text, below the scale bar and inside the page", () => {
  const c = DEFAULT_LAYOUT_ELEMENTS.find((e) => e.id === "credits");
  assert.ok(c, "a credits element");
  assert.equal(c.type, "text"); assert.equal(c.text, "{credits}");
  assert.ok(c.y > DEFAULT_LAYOUT_ELEMENTS.find((e) => e.id === "scale").y, "below the scale bar");
  assert.ok(c.x + c.w <= 1123 && c.y < 794, "inside an A4 landscape page");
  assert.equal(DEFAULT_LAYOUT_ELEMENTS.find((e) => e.id === "title").text, "{project}", "the title stays as it was");
});

test("a new project's first page carries it, and an older save's own page is left alone", () => {
  const fresh = fieldsFromPayload({ version: 1 });
  assert.ok(fresh.layoutPages[0].elements.some((e) => e.id === "credits"));
  const old = fieldsFromPayload({ version: 1, layoutPages: [{ id: "p1", name: "Page 1", elements: [{ id: "t", type: "title" }] }] });
  assert.deepEqual(old.layoutPages[0].elements, [{ id: "t", type: "title" }]);
});

test("the credit is the data owner's own words, ahead of the licence lines; with none the text is empty", () => {
  assert.equal(projectCredits(null, [], MACPASS_CREDIT), MACPASS_CREDIT);
  assert.equal(projectCredits(null, [], ""), "");
  assert.ok(projectCredits({ source: { service: "Copernicus DEM" } }, [], MACPASS_CREDIT).startsWith(MACPASS_CREDIT));
});

test("the project keeps dataCredit across a save and reopen", () => {
  const s = read("../src/lib/store.jsx");
  assert.match(s, /const setProjectDataCredit = useCallback\(\(dataCredit\) => setProject\(/);
});

test("wired: the status bar shows project.dataCredit on every tab, with the full text as its tooltip", () => {
  const a = read("../src/App.jsx"), css = read("../src/styles/app.css");
  assert.match(a, /\{project\.dataCredit && <span className="ge-credit" title=\{project\.dataCredit\}>\{project\.dataCredit\}<\/span>/);
  assert.match(css, /\.ge-status \.ge-credit \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
});

test("reading a saved project brings dataCredit back with the project (the save is the project object, wholesale)", () => {
  const f = fieldsFromPayload({ version: 1, project: { name: "Macpass", dataCredit: MACPASS_CREDIT } });
  assert.equal(f.project.dataCredit, MACPASS_CREDIT);
});
