// TASKS.csv #2680 — the basemap area picker (draw mode) loads no map tiles until the user asks for the online map
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const b = readFileSync(new URL("../src/components/BasemapView.jsx", import.meta.url), "utf8");

test("#2680 no tiles in the area picker until 'Show the online map'", () => {
  assert.match(b, /const \[online, setOnline\] = useState\(mode !== "draw"\);/);
  assert.match(b, /\{online && tiles\.filter\(/); // the only place tiles are requested on view
  assert.match(b, /onClick=\{\(\) => setOnline\(true\)\}[^>]*>\{tr\("Show the online map"\)\}/);
  assert.match(b, /\{online && tileState\.failed >= 3 && !tileState\.ok && \(/);
  assert.equal((b.match(/<CachedTile/g) || []).length, 1);
});
