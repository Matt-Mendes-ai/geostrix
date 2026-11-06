// TASKS.csv #1472 (Spectral index dialog) and #1473 (coordinate tools) — text slips from the #1352 Maps review
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("#1472: Custom starts from a valid formula; the download note only where something is downloaded; steps in order", () => {
  const s = read("../src/components/SpectralIndexModal.jsx");
  assert.match(s, /if \(v === CUSTOM\) setCustom\(fetchMode \? \(preset\?\.expr \|\| /);
  assert.ok(s.includes('v: fetchMode ? tr(" Downloads one more band.") : ""'));
  assert.ok(read("../src/components/HyperspectralTab.jsx").includes('{file ? tr("3. Feature") : tr("2. Feature")}'));
});

test("#1473: a count of one in the singular; the message cleared when the pane changes", () => {
  const c = read("../src/modules/CartographyModule.jsx");
  assert.ok(c.includes('n === 1 ? k.replace(/ies$/, "y").replace(/s$/, "") : k'));
  assert.match(c, /useEffect\(\(\) => \{ setMsg\(null\); \}, \[pane\]\);/);
  const one = (k) => k.replace(/ies$/, "y").replace(/s$/, "");
  assert.deepEqual(["boundaries", "DC/IP lines", "terrain", "OMF objects", "survey stations"].map(one), ["boundary", "DC/IP line", "terrain", "OMF object", "survey station"]);
});
