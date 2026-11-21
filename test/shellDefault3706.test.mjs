// TASKS.csv #3706 (Matt: "yes") — the estimate is restricted to the element's closed grade shell BY DEFAULT, with a line saying so (the shell's volume against the box around the drilling) and a
// switch to turn it off; Grade-tonnage reports inside the same shell by default. Wiring pins + the volume of the shell the default line quotes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellComparison } from "../src/lib/shellCompare.js";

const rd = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("Estimation: the default is the closed grade shell; a picked volume wins; '— none —' or the switch turns it off, and that is kept", () => {
  const e = rd("components/GradeEstimationModal.jsx");
  assert.match(e, /const \[shellPick, setShellPick\] = useState\(\(\) => keep\("shellId", ""/);
  assert.match(e, /const \[shellDefaultOff, setShellDefaultOff\] = useState\(\(\) => keep\("shellDefaultOff", false\)\);/);
  assert.match(e, /const shellAuto = !shellPick && !!gradeShell && !shellDefaultOff;/);
  assert.match(e, /const shellId = shellPick \|\| \(shellAuto \? gradeShell\.id : ""\);/);
  assert.match(e, /const setShellId = \(id\) => \{ setShellPick\(id\); setShellDefaultOff\(!id\); \};/);
  assert.match(e, /shellId: shellPick, shellDefaultOff \/\* #3706 \*\//);
  assert.match(e, /if \(shellAuto\) params\.restrictedByDefault = /);
  assert.match(e, /\{shellAuto && \(/);
  assert.match(e, /<input type="checkbox" checked onChange=\{\(\) => \{ setShellPick\(""\); setShellDefaultOff\(true\); \}\} \/>\{tr\("Restrict to the grade shell by default"\)\}/);
  assert.match(e, /onClick=\{\(\) => \{ setShellPick\(""\); setShellDefaultOff\(false\); \}\}[^>]*>\{tr\("Restrict to it"\)\}/, "with the default off, the old proposal turns it back on");
  assert.equal((e.match(/const gradeShell = useMemo/g) || []).length, 1, "declared once, before its first use");
  assert.ok(e.indexOf("const gradeShell = useMemo") < e.indexOf("const shellBox = useMemo"));
});

test("Grade-tonnage: the same default, inside the element's grade shell for an unrestricted model; a pick or the switch turns it off", () => {
  const g = rd("components/GradeTonnageModal.jsx");
  assert.match(g, /const \[solidPick, setSolidPick\] = useState\(null\);/);
  assert.match(g, /const solidId = solidPick \?\? \(shellCmp \? shellCmp\.id : ""\);/);
  assert.match(g, /const insideByDefault = solidPick == null && !!shellCmp && !!solid;/);
  assert.match(g, /<input type="checkbox" checked onChange=\{\(\) => setSolidPick\(""\)\} \/>\{tr\("Report inside the grade shell by default"\)\}/);
  assert.ok(g.indexOf("const shellCmp = useMemo") < g.indexOf("const solidId ="));
});

test("a model already restricted to a volume gets no default (its own record says so)", () => {
  const box = { id: "s", name: "Zn > 2 shell", vertices: Float64Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10]), indices: Uint32Array.from([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]), params: { tool: "numeric grade shell", element: "Zn", cutoff: 2 } };
  const cells = [{ value: 3, dx: 10, dy: 10, dz: 10 }];
  assert.ok(shellComparison({ cells, params: { element: "Zn" } }, [box]));
  assert.equal(shellComparison({ cells, params: { element: "Zn", restrictedToVolumeName: "Zn > 2 shell" } }, [box]), null);
});

test("turning the default off refits a cell the dialog chose (it went over the budget and left Run disabled): only a typed cell is kept", () => {
  const e = rd("components/GradeEstimationModal.jsx");
  assert.match(e, /const cellTyped = useRef\(!!\(saved && saved\.cellTyped\)\);/);
  assert.match(e, /const cellTouched = useRef\(cellTyped\.current\);/);
  assert.match(e, /cellTyped: cellTyped\.current \/\* #3706 \*\//);
  assert.match(e, /if \(!cellTyped\.current && \(autoCell == null \|\| cellSize === autoCell\) && fitCell > cellSize\)/);
  assert.match(e, /if \(!bounds \|\| matched \|\| cellTyped\.current \|\| \(autoCell != null && cellSize !== autoCell\)\) return undefined;/);
  assert.match(e, /onChange=\{\(n\) => \{ cellTouched\.current = true; cellTyped\.current = true; setAutoCell\(null\);/);
});
