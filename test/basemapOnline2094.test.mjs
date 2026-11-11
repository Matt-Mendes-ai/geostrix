// TASKS.csv #2094 (review #2013) — 'Fetch terrain for this area' loads basemap tiles from the internet as it opens: the dialog says so, and
// that nothing is fetched for the project until its button is pressed (the offline message is #1465's)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the area picker says its map is an online basemap", () => {
  const b = readFileSync(new URL("../src/components/BasemapView.jsx", import.meta.url), "utf8");
  assert.match(b, /tr\("The map is an online basemap \(\{layer\}\): its tiles load from the internet as you look around\. Nothing is fetched for the project until you press \{confirm\}\.", \{ layer: tr\(getBaseLayer\(effectiveLayerId\)\?\.label \|\| "Standard"\), confirm: tr\(confirmLabel\) \}\)/);
  assert.match(b, /The map tiles could not be loaded \(offline, or the tile server is blocked\)/); // #1465 still there
});
