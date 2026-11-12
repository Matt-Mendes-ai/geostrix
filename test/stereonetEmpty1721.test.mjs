// TASKS.csv #1721 (review #1645, Copley) — the stereonet's pole plot had no empty state (the rose had one) and Export SVG stayed enabled
// on an empty plot
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8");

test("the pole plot says what is missing and why the picks are not drawn", () => {
  assert.match(m, /\{plotted === 0 && \(\s*<g fontSize=\{11\} fill="#65717e" textAnchor="middle">/);
  assert.match(m, /picks\.length \? tr\("No picks with a valid dip \/ dip direction"\) : noData \? tr\("No structure picks or outcrop measurements yet"\) : source === "surface" \? tr\("No outcrop measurements yet"\) : tr\("No downhole structure picks yet"\)/); // #2389: noData first
  assert.match(m, /unplotted\.alphaOnly > 0 && <text x=\{CX\} y=\{CY \+ 12\}>\{tr\("\{n\} alpha only \(no beta\): a plane needs both angles to be oriented"/);
});

test("Export SVG is disabled while nothing is plotted, in both views", () => {
  assert.match(m, /<button onClick=\{exportSvg\} disabled=\{view === "rose" \? !rose : plotted === 0\}/);
});
