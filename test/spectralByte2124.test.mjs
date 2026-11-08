// TASKS.csv #2124 (review #2013, Maps) — an 8-bit, 3-band picture was read as DN ÷ 10,000, 70 % of it blanked as 'under 1 %
// reflectance', and the raster named 'Sentinel-2 surface reflectance'. An 8-bit file now reads as 8-bit values.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectEncoding, evaluateIndex, DN_ENCODINGS } from "../src/lib/spectralIndices.js";
const m = readFileSync(new URL("../src/components/SpectralIndexModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// a picture: red 40-250, blue 20-200 (values a camera or a viewer screenshot gives)
const n = 4000, red = new Float32Array(n), green = new Float32Array(n), blue = new Float32Array(n);
for (let i = 0; i < n; i++) { red[i] = 40 + (i * 37) % 211; green[i] = 30 + (i * 53) % 190; blue[i] = 20 + (i * 71) % 181; }

test("an 8-bit file is read as 8-bit values; the guess from values alone is unchanged", () => {
  assert.equal(detectEncoding([red, blue], "sentinel2", { bits: 8 }), "byte");
  assert.equal(detectEncoding([red, blue], "sentinel2"), "scaled"); // what the picture got before
  assert.equal(detectEncoding([new Float32Array([1200, 1500, 3000])], "sentinel2", { bits: 16 }), "s2offset");
  assert.match(DN_ENCODINGS.byte.label, /8-bit values 0-255/);
});
test("the dark floor no longer blanks the picture, and the ratios are the file's own", () => {
  const map = { B4: 1, B2: 3 };
  const before = evaluateIndex([red, green, blue], map, "B4/B2", { floor: "auto", encoding: "scaled" });
  assert.ok(before.dark / n > 0.5, `before: ${before.dark}`); // a value under 100 is "under 1 % reflectance" read this way (the reviewer: 70 %)
  const after = evaluateIndex([red, green, blue], map, "B4/B2", { floor: "auto", encoding: "byte" });
  assert.equal(after.dark, 0);
  assert.equal(after.blank, 0);
  assert.ok(Math.abs(after.values[5] - red[5] / blue[5]) < 1e-6);
});
test("the modal reads the bit depth, names the raster after the index and file, and says what the values are", () => {
  assert.match(m, /bits = image\.getBitsPerSample\?\.\(0\) \?\? null/);
  assert.match(m, /const byteFile = !fetchMode && reflective && \(dnEnc === "byte" \|\| \(dnEnc === "auto" && bits === 8\)\);/);
  assert.match(m, /byteFile \? `\$\{preset\.label\}, 8-bit values`/);
  assert.match(m, /sensorKey, \{ bits \}\)/);
  assert.match(m, /msg \+ note \+ encNote \+ byteNote\);/);
});
