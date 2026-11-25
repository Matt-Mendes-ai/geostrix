// TASKS.csv #4048 (Matt, 2026-11-24, an empty StrixViewer project: "we should also have the section images as a tool in the ribbon"): Sections > Section image opens the
// same Georeference a section image dialog as the sidebar's Section images row, which stays. The dialog asks for the line itself (a saved section, two clicks or typed ends),
// so it opens with no holes and no saved sections too.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const parts = read("../src/modules/viewer/ViewerParts.jsx");
const viewer = read("../src/modules/ViewerModule.jsx");
const icons = read("../src/components/ribbonIcons.jsx");

const TIP = "Put a scanned or drawn section on its line in 3D: pick the line, click points on the image and type what the figure says.";

test("the Sections group has a Section image button with its own icon and a tooltip that says what it does", () => {
  const sections = parts.slice(parts.indexOf('<RibbonGroup label="Sections">'), parts.indexOf('<RibbonGroup label="Measure & check">'));
  const m = sections.match(/<RibbonButton advanced icon=\{SectionImageIcon\} label="Section image" tone="section" title="([^"]+)" onClick=\{onSectionImage\} \/>/);
  assert.ok(m, "Sections > Section image, Advanced like By coordinates and Fence series, in the section colour");
  assert.equal(m[1], TIP);
  assert.match(parts, /import \{[^}]*\bSectionImageIcon\b[^}]*\} from "..\/..\/components\/ribbonIcons.jsx"/);
  assert.match(icons, /SectionImageIcon = icon\(ICONS\.SectionImage\)/);
  assert.match(icons, /\n {2}SectionImage: \[/);
});

test("it opens the sidebar row's dialog, and the sidebar row stays", () => {
  assert.match(viewer, /onSectionImage=\{\(\) => setSectionGeorefOpen\(true\)\}/);
  assert.match(viewer, /onClick=\{\(\) => setSectionGeorefOpen\(true\)\}[^\r\n]*\{tr\("\+ Georeference a section image…"\)\}/);
});

test("the dialog does not need holes or saved sections: it asks for the line itself", () => {
  const d = read("../src/components/SectionGeorefModal.jsx");
  assert.match(d, /sections = \[\], onImport, onClose/);
  assert.match(d, /collars = \[\]/);
  assert.match(d, /tr\("Draw on the plan"\)/); assert.match(d, /tr\("Type the ends"\)/); // #4071: the guided flow asks for the line only when the figure gives none
});

test("the tooltip is in every language", () => {
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${l}.json`));
    assert.ok(d[TIP] && d[TIP] !== TIP, `${l}: tooltip`);
    assert.ok(d["Section image"] && d["Section image"] !== "Section image", `${l}: the label`);
  }
});
