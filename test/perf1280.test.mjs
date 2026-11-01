// TASKS.csv #1280 Woodjam's load; #1279 the Layout capture
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1280 both OMF imports go through the worker, with a fallback and their language", () => {
  assert.match(read("src/lib/sampleWoodjam.js"), /omfToProjectObjectsAsync\(/);
  assert.match(read("src/modules/GeophysicsModule.jsx"), /omfToProjectObjectsAsync\(buf/);
  const s = read("src/lib/omfImport.js");
  assert.match(s, /new Worker\(new URL\("\.\/omfImport\.worker\.js"/);
  assert.match(s, /catch \{ omfToProjectObjects\(/);
  assert.match(s, /dictionary: currentDictionary\(\)/);
  assert.match(read("src/lib/omfImport.worker.js"), /setDictionary\(language, dictionary\)/);
});

test("#1279 the capture encodes off the thread, and its result or failure still arrives", () => {
  const s = read("src/modules/ViewerModule.jsx");
  assert.match(s, /encoded: canvasPngDataUrl\(c\)/);
  assert.match(read("src/lib/canvasEncode.js"), /canvas\.toBlob\(/);
  assert.doesNotMatch(s.slice(s.indexOf("function captureHiRes"), s.indexOf("function fitScreenLabels")), /toDataURL/);
  assert.match(s, /encoded\.then\(\(dataUrl\) => resolveViewportRender/);
  assert.match(s, /\(err\) => resolveViewportRender\(\{ requestId: req\.requestId, error: err\.message \}\)/);
});
