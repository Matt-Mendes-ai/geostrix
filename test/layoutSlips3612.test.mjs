// TASKS.csv #3612 (Fireweed rehearsal, steps 6 and 7) — slips met on Macpass: (1) the PDF's document title was 'GeoStrix' whatever the title block said; (4) 'Plan a deeper hole here' for a flat or upward hole;
// (5) the Planned drillholes Help page printed raw placeholders. Not done here: (2) the paper by the system's place, (3) the project name from the file name, (6) z_source on the round trip, (7) a title block
// running past the sheet, (8) a second nearest hole, (9) the section stub, (10) the density heading's unit.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { documentTitle } from "../src/lib/layoutTitleBlock.js";
import { pageById } from "../src/help/content.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the PDF title: the title block's Title, else a title text, else the project, else GeoStrix; a bare token is not a title", () => {
  const tb = (title) => ({ type: "titleblock", rows: [["Title", title], ["Project", "{project}"]] });
  assert.equal(documentTitle([{ elements: [tb("Zn drill plan")] }], { name: "macpass" }), "Zn drill plan");
  assert.equal(documentTitle([{ elements: [tb("")] }], { name: "macpass" }), "macpass");
  assert.equal(documentTitle([{ elements: [tb("{project}"), { type: "title", text: "Section 90" }] }], {}), "Section 90");
  assert.equal(documentTitle([{ elements: [] }], {}), "GeoStrix"); assert.equal(documentTitle([], null), "GeoStrix");
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /document\.title = documentTitle\(layoutPages, project\)/); assert.match(l, /finally \{ document\.title = oldTitle; \}/);
});
test("a hole that ends in ore: 'Plan a hole past this end', in four languages; the Planned drillholes page has no raw placeholder in a message", () => {
  const c = read("../src/components/EndInOreList.jsx"); assert.ok(c.includes('tr("Plan a hole past this end")')); assert.doesNotMatch(c, /deeper hole/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["Plan a hole past this end"], l);
  for (const w of pageById("planned-drillholes").warnings) assert.doesNotMatch(w.says, /\{(d|s|z|h|hole_id|distance|minSpacing|holes|m|hole|min|md|toe|plannedHoles|format|today)\}/, w.says.slice(0, 50));
});
