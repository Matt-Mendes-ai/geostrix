// TASKS.csv #2712 — {north} and {convergence} placeholders for a title block or a text
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { northName, pageConvergence, formatConvergence, fillPlaceholders } from "../src/lib/layoutText.js";

test("which north: grid north with a coordinate system, local grid north on a mine grid, nothing without either", () => {
  assert.equal(northName({ epsg: 32609 }), "Grid north");
  assert.equal(northName({ epsg: 32609, crsSet: false }), "Local grid north");
  assert.equal(northName({}), "");
});

test("the page's own GN / TN / MN diagram gives the convergence when there is one", () => {
  assert.equal(pageConvergence([{ type: "north", decl: { convergence: 1.234, declination: 16 } }], { epsg: 32609 }, []), 1.234);
});

test("else it is computed at the collars' centre: about Δλ · sin φ, true north west of grid north east of the central meridian", () => {
  // UTM 9N, 600 km E (about 1.6° east of 129° W) at 56° N: γ ≈ 1.6 · sin 56° ≈ 1.3°; true north points west of grid north
  const c = pageConvergence([], { epsg: 32609 }, [{ x: 599000, y: 6206000 }, { x: 601000, y: 6208000 }]);
  assert.ok(c < -1.0 && c > -1.7, String(c));
  assert.equal(formatConvergence(c), `TN ${Math.abs(c).toFixed(1)}° W of GN`); // #3028 (1): both norths named
  assert.equal(pageConvergence([], { epsg: 32609, crsSet: false }, [{ x: 1, y: 1 }]), null, "a local grid has no convergence");
  assert.equal(pageConvergence([], { epsg: 32609 }, []), null, "no collars, no diagram");
  assert.equal(formatConvergence(null), "");
});

test("an empty convergence takes its separator with it", () => {
  const re = /\{(north|convergence)\}/g;
  assert.equal(fillPlaceholders("{north} · {convergence}", { north: "Grid north", convergence: "" }, re), "Grid north");
});

test("wired into the page context and the help line", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const PLACEHOLDER = \/\\\{\(project\|date\|page\|pages\|pagename\|scale\|crs\|credits\|north\|convergence\)\\\}\/g;/);
  assert.match(m, /north: northName\(project\) \? tr\(northName\(project\)\) : "", convergence: formatConvergence\(pageConvergence\(els, project, collars\)\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Grid north", "Local grid north"]) assert.ok(d[k], `${lang}: ${k}`); // reached through a variable
  }
});
