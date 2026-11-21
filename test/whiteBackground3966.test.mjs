// TASKS.csv #3966 (Matt: "the default background in all viewports to be white. Also layout paper has to be white. For the viewport user should have
// the option, perhaps in Edit < Background, to change colour.") — white by default through two tokens (--color-view-bg / colors.viewBg, --color-paper
// / colors.paper); a stored background equal to the old grey default reads as not picked; Edit > Background colour... opens the 3D view's own picker.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { colors, viewBgOf } from "../src/lib/theme.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("white by default: the tokens, and a stored old grey reads as not picked", () => {
  assert.equal(colors.viewBg, "#ffffff"); assert.equal(colors.paper, "#ffffff");
  const css = read("../src/styles/app.css");
  assert.match(css, /--color-view-bg: #ffffff;/); assert.match(css, /--color-paper: #ffffff;/);
  assert.equal(viewBgOf(undefined), "#ffffff");
  assert.equal(viewBgOf(""), "#ffffff");
  assert.equal(viewBgOf("#f4f5f7"), "#ffffff", "an old project's default");
  assert.equal(viewBgOf("#F4F5F7"), "#ffffff");
  assert.equal(viewBgOf("#203040"), "#203040", "a colour the user picked stays");
  assert.equal(viewBgOf("#ffffff"), "#ffffff");
});

test("wired: the 3D view (with its edge), the Maps plan, the Layout paper on screen and in print", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /const DEFAULT_BG_COLOR = colors\.viewBg;/);
  assert.match(v, /setBgColor\(viewBgOf\(s\.bgColor\)\);/, "a project's stored colour");
  assert.match(v, /bgColor: viewBgOf\(s\?\.bgColor\)/, "a theme captured from the state");
  assert.match(v, /if \(theme\.bgColor\) setBgColor\(viewBgOf\(theme\.bgColor\)\);/, "a saved theme");
  assert.match(v, /<div ref=\{mountRef\} style=\{\{ width: "100%", height: "100%", outline: "1px solid var\(--color-border\)", outlineOffset: -1/, "a white view keeps an edge");
  const m = read("../src/components/MapsPlanView.jsx");
  assert.doesNotMatch(m, /fillStyle = "#f4f5f2"/); assert.equal((m.match(/fillStyle = colors\.viewBg;/g) || []).length, 2);
  const l = read("../src/modules/LayoutModule.jsx");
  assert.doesNotMatch(l, /"#fbfbf8"/); assert.match(l, /background: "var\(--color-paper\)"/);
  assert.match(read("../src/styles/app.css"), /\.ge-print-page \{[^}]*background: var\(--color-paper\);/);
});

test("Edit > Background colour...: the menu item, App routes it to the 3D view on screen, the card with White (default)", () => {
  const main = read("../electron/main.js");
  assert.match(main, /\{ label: L\("Background colour…"\), click: \(\) => mainWindow\?\.webContents\.send\("menu", "background-colour"\) \}/);
  for (const t of ["Color de fondo…", "Cor de fundo…", "Couleur de fond…", "لون الخلفية…"]) assert.ok(main.includes(`"Background colour…": "${t}"`), t);
  assert.match(read("../src/App.jsx"), /else if \(action === "background-colour"\) \{ if \(!\["viewer", "modelling", "targeting", "minedesign"\]\.includes\(activeRef\.current\)\) setActive\("viewer"\); requestModuleAction\("background-colour"\); \}/);
  const box = read("../src/modules/viewer/BackgroundColourBox.jsx");
  assert.match(box, /useModuleAction\(\["background-colour"\], \(\) => \{ if \(visible\) setOpen\(true\); \}\);/);
  assert.match(box, /onClick=\{\(\) => setBgColor\(colors\.viewBg\)\}/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /<BackgroundColourBox visible=\{visible\} bgColor=\{bgColor\} setBgColor=\{setBgColor\} \/>/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /<span>\{tr\("Background colour"\)\}<\/span>/, "the right-click entry stays");
});
