// TASKS.csv #2238 — no IGRF field and no grid convergence from the placeholder CRS
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the IGRF button, the compute and a magnetic run all refuse while the project CRS is not set", () => {
  assert.ok(s.includes("const crsUnset = project?.crsSet === false;"));
  assert.ok(s.includes("disabled={!field.date || !rows.length || crsUnset}"));
  const compute = s.slice(s.indexOf("const computeIgrf = async () => {"), s.indexOf("const ll = await toLonLat(cx, cy, project.epsg);"));
  assert.ok(compute.includes("if (crsUnset) { setIgrfMsg({ ok: false, text: tr(\"IGRF needs the survey's real-world location")); // beside the button since #2563
  const run = s.indexOf('if (method === "mag" && crsUnset) return { problems: ['), conv = s.indexOf('if (method === "mag") { decl = gridDeclination(');
  assert.ok(run > 0 && run < conv, "checked before the grid convergence");
});
