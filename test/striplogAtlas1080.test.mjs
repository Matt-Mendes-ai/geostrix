// TASKS.csv #1080 — strip-log labels cut before escaping; one hole's strip-log failure does not abort the atlas
import { test } from "node:test";
import assert from "node:assert/strict";
import sax from "sax";
import { buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";
import { generateAtlasPages } from "../src/lib/atlas.js";

const collars = [{ hole_id: "H1", x: 0, y: 0, z: 0, depth: 100 }, { hole_id: "H2", x: 50, y: 0, z: 0, depth: 80 }];
const litho = [{ hole_id: "H1", from: 0, to: 60, value: "Quartz vein & alteration" }, { hole_id: "H1", from: 60, to: 100, value: "Sulphide <5% diss" }];

test("#1080 a label with & or < cut to 14 characters is still well-formed XML", () => {
  const { svg } = buildStripLogSvgMarkup({ holeId: "H1", collars, layers: { litho } });
  const p = sax.parser(true); let err = null;
  p.onerror = (e) => { err = e; p.resume(); };
  p.write(svg).close();
  assert.equal(err, null, String(err));
  assert.match(svg, />Quartz vein &amp; </);
});

test("#1080 a strip log that cannot be drawn leaves its page in the atlas, flagged", async () => {
  // Node has no Image: the rasterize step fails for H1, as a malformed SVG did in Chromium
  const pages = await generateAtlasPages({ mode: "hole", items: ["H1", "H2"], templateElements: [{ type: "text", text: "{{hole_id}}" }], collars, layers: { litho }, includeStripLog: true });
  assert.deepEqual(pages.map((pg) => [pg.name, pg.stripLogFailed, pg.elements.length]), [["H1", true, 1], ["H2", false, 1]]); // H2 has no log: no strip log, nothing failed
});

test("#1092 Atlas strip logs use the legend's colour and name overrides", () => {
  const plain = buildStripLogSvgMarkup({ holeId: "H1", collars, layers: { litho } }).svg;
  const { svg } = buildStripLogSvgMarkup({ holeId: "H1", collars, layers: { litho }, legendOverride: { litho: { "Quartz vein & alteration": { color: "#123456", label: "QV" } } } });
  assert.match(svg, /fill="#123456"/);
  assert.match(svg, />QV</);
  assert.doesNotMatch(plain, /#123456/);
  assert.match(svg, /Sulphide &lt;5% d/); // a value with no override keeps its default name
});
