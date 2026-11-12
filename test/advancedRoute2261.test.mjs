// TASKS.csv #2261 — Undrilled zones' help names Voxel ranges, an Advanced-ribbon tool: the text says so, in every language
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const NEW = "(Targeting > Voxel ranges, on the Advanced ribbon > Shell at this range)";

test("the pane, its help page and the four locales say the tool is on the Advanced ribbon", () => {
  const p = fs.readFileSync("src/components/UndrilledZonesPane.jsx", "utf8");
  assert.equal(p.split(NEW).length - 1, 2);
  assert.ok(!p.includes("(Targeting > Voxel ranges > Shell at this range)"));
  assert.ok(fs.readFileSync("src/help/pages/targeting.js", "utf8").includes(NEW));
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(`src/locales/${lang}.json`, "utf8"));
    const keys = Object.keys(d).filter((k) => k.includes(NEW));
    assert.equal(keys.length, 2, lang);
    for (const k of keys) assert.match(d[k], { es: /cinta Avanzado/, pt: /faixa Avançado/, fr: /ruban Avancé/, ar: /الشريط المتقدم/ }[lang], lang);
  }
  // the button itself is still Advanced-only (making it Simple is ViewerModule.jsx's ribbon, left to the main session)
  assert.match(fs.readFileSync("src/modules/ViewerModule.jsx", "utf8"), /<RibbonButton advanced icon=\{Box\} label="Voxel ranges"/);
});
