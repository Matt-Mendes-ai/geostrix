// TASKS.csv #2303 (Matt's decision 2026-11-09: capture Layout viewports at 200 dpi on the page, 300 dpi when exporting) — the 3D View's
// part: the render request's dpi reaches captureLongPx. The request field (store.jsx) and captureLongPx's dpi argument are Main's part.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2303 the viewport capture passes the request's dpi to captureLongPx", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /captureLongPx\(req\.elementW, req\.elementH, CAPTURE_LONG_PX, req\.dpi \|\| undefined\)/);
});
