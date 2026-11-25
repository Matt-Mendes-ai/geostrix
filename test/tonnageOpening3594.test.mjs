// TASKS.csv #3594 (Fireweed rehearsal, Macpass) — 'Grade-tonnage table...' opened on the last model added, the density estimate (cut-offs in
// g/cc, 'Mean grade (g/cc)'); its metal columns ran off a 640 px dialog. Density models are left out of the picker (the table offers them under
// 'Density by'), the table opens on the latest set's primary element, and the dialog can be dragged wider (resize).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tonnageModels, openingModel } from "../src/lib/tonnageModels.js";

const cells = [{ x: 0, y: 0, z: 0, value: 1 }];
const set = { id: "s1", elements: ["Zn", "Ag", "Pb"], primary: "Zn" };
const m = (id, element, extra = {}) => ({ id, name: `${element} estimate (idw2, 10m)`, source: "estimate-idw2", cells, params: { element, ...extra } });

test("the picker leaves density models out; the table opens on the latest set's primary element, else the latest model", () => {
  const zn = m("zn", "Zn", { set }), ag = m("ag", "Ag", { set }), pb = m("pb", "Pb", { set }), sg = m("sg", "Specific gravity");
  const list = tonnageModels([zn, ag, pb, sg]);
  assert.deepEqual(list.map((x) => x.id), ["zn", "ag", "pb"], "no density model");
  assert.equal(openingModel(list).id, "zn", "the set's primary, not its last member");
  const cu = m("cu", "Cu");
  assert.equal(openingModel(tonnageModels([zn, ag, pb, sg, cu])).id, "cu", "a later model on its own: that one");
  assert.equal(openingModel([]), null);
  assert.deepEqual(tonnageModels([sg]), [], "only a density model: no table offered");
});

test("wiring: the launcher uses them; the dialog can be widened by dragging its corner", () => {
  const l = readFileSync(new URL("../src/components/GradeTonnageLauncher.jsx", import.meta.url), "utf8");
  assert.match(l, /const models = useMemo\(\(\) => tonnageModels\(voxelModels\), \[voxelModels\]\);/);
  assert.match(l, /const model = models\.find\(\(m\) => key\(m\) === id\) \|\| openingModel\(models\);/);
  const d = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(d, /width="min\(640px, 94vw\)" panelStyle=\{\{ minWidth: "min\(480px, 94vw\)", maxWidth: "96vw", resize: "horizontal"/); // #4073: through StepDialog's panelStyle
  assert.match(readFileSync(new URL("../src/components/StepDialog.jsx", import.meta.url), "utf8"), /position: "relative", \.\.\.panelStyle \}\}/);
});
