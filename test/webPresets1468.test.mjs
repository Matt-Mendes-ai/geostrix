// TASKS.csv #1468 — Add web layer asked for a raw OGC URL with no presets, and kept the '/wms' placeholder for WFS
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMON_WEB_SERVICES, presetService } from "../src/lib/webServices.js";

test("open-licence presets only, each with a licence and a layer; their hosts are in every privacy page", () => {
  assert.ok(COMMON_WEB_SERVICES.length >= 3);
  const privacy = ["../PRIVACY.md", "../website/privacy.html", "../website/es/privacy.html", "../website/fr/privacy.html", "../website/pt-br/privacy.html", "../website/ar/privacy.html"].map((p) => readFileSync(new URL(p, import.meta.url), "utf8"));
  for (const p of COMMON_WEB_SERVICES) {
    assert.ok(p.licence && /Open Government Licence|Creative Commons/.test(p.licence), p.id);
    assert.ok(p.layer && p.label && (p.wms || p.wfs), p.id);
    for (const u of [p.wms, p.wfs].filter(Boolean)) {
      assert.match(u, /^https:\/\//);
      const host = new URL(u).host;
      privacy.forEach((doc, i) => assert.ok(doc.includes(host), `${host} missing from privacy page ${i}`));
    }
  }
  assert.ok(!COMMON_WEB_SERVICES.some((p) => /MINFIL/i.test(p.layer))); // MINFILE is 'Access Only'
});

test("the service type follows what the preset offers", () => {
  const ga = COMMON_WEB_SERVICES.find((p) => p.id === "ga-surface"), bc = COMMON_WEB_SERVICES.find((p) => p.id === "bc-bedrock");
  assert.equal(presetService(ga, "wfs"), "wms");
  assert.equal(presetService(bc, "wfs"), "wfs");
  assert.equal(presetService(null, "wfs"), "wfs");
});

test("the dialog offers them and the placeholder follows the service type", () => {
  const s = readFileSync(new URL("../src/components/AddWebLayerModal.jsx", import.meta.url), "utf8");
  assert.match(s, /placeholder=\{service === "wfs" \? tr\("https:\/\/example\.gov\/geoserver\/wfs"\) : tr\("https:\/\/example\.gov\/geoserver\/wms"\)\}/);
  assert.match(s, /fetchCapabilities\(s, p\[s\], p\.layer\)/);
  assert.match(s, /tr\("Licence: \{v\}\. Credit the publisher in figures you share\.", \{ v: preset\.licence \}\)/);
});
