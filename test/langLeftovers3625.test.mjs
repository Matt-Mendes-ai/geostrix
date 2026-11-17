// TASKS.csv #3625 (Fireweed rehearsal) — what the four languages still left in English on the 3D view: the legend heading 'Specific gravity' (the sidebar beside it said 'Peso específico') and
// 'Survey' in Spanish and Portuguese. Not done here: numbers still print with the English thousands comma ('n 32,426').
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the legend heading of a layer is translated like the sidebar's; Survey is translated in Spanish and Portuguese", () => {
  assert.match(read("../src/components/ViewportFigureOverlay.jsx"), /title=\{\(g\.translated \? g\.label : tr\(g\.label\)\)\}>\{\(g\.translated \? g\.label : tr\(g\.label\)\)/);
  const loc = (l) => JSON.parse(read(`../src/locales/${l}.json`));
  assert.equal(loc("es")["Survey"], "Levantamiento"); assert.equal(loc("pt")["Survey"], "Levantamento");
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(loc(l)["Specific gravity"] && loc(l)["Specific gravity"] !== "Specific gravity", l);
});
