// TASKS.csv #2677 — GradeEstimationModal passed unitLabel to CapAuditHint twice; JSX keeps the LATER prop, so the
// first one (the #2218 gradeUnitLabel) was silently dead. esbuild warns 'Duplicate "x" attribute in JSX element'.
// This guards the 3D Modelling dialogs and panes against the same slip: every file here must transform with no
// duplicate-attribute (or duplicate object key) warning. Scoped to the modelling files, not all of src, to keep the
// suite fast on a modest machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENTS = ["GradeEstimationModal", "CompositingModal", "GradeTonnageModal", "VariogramModal", "SolidToolsModal", "SurfaceQueryModal", "SurfaceCompareModal", "FenceDiagramModal", "BlockModelMappingModal"];
const files = [
  ...COMPONENTS.map((n) => path.join(root, "src", "components", n + ".jsx")),
  ...fs.readdirSync(path.join(root, "src", "modules", "viewer")).filter((f) => /\.jsx?$/.test(f)).map((f) => path.join(root, "src", "modules", "viewer", f)),
].filter((f) => fs.existsSync(f));

test("#2677: modelling dialogs and panes carry no duplicate JSX attribute or object key", () => {
  assert.ok(files.length >= 10, "the modelling files were found");
  const found = [];
  for (const f of files) {
    const { warnings } = transformSync(fs.readFileSync(f, "utf8"), { loader: f.endsWith(".jsx") ? "jsx" : "js", jsx: "preserve", logLevel: "silent" });
    for (const w of warnings) if (/duplicate/i.test(w.text)) found.push(`${path.relative(root, f)}:${w.location?.line}: ${w.text}`);
  }
  assert.deepEqual(found, []);
});

test("#2677: the cap hint takes the #2218 grade unit label (g/t for precious metals in ppm)", () => {
  const src = fs.readFileSync(path.join(root, "src", "components", "GradeEstimationModal.jsx"), "utf8");
  const at = src.indexOf("<CapAuditHint ");
  assert.ok(at >= 0, "the CapAuditHint element is there");
  const tag = src.slice(at, src.indexOf("/>", at)); // the props hold "=>" arrows, so cut at the self-closing "/>"
  assert.equal((tag.match(/\bunitLabel=/g) || []).length, 1);
  assert.match(tag, /unitLabel=\{gradeUnitLabel\(symbol, unit\)\}/);
});
