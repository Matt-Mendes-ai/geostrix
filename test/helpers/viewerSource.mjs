// TASKS.csv #2176 — ViewerModule's drillhole scene build moved to src/modules/viewer/drillholeScene.js and its prototype geometries to
// src/lib/viewer/protos.js: a source pin on that code reads the three files as one text, ViewerModule first.
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
export const viewerSource = () => ["src/modules/ViewerModule.jsx", "src/modules/viewer/drillholeScene.js", "src/lib/viewer/protos.js"].map(read).join("\n").replace(/\r\n/g, "\n"); // LF, as the pins expect
