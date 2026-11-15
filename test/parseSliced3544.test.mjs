// TASKS.csv #3544 — a plain table read a slice at a time (parseTableTextSliced: Papa's step callback pauses after a slice and resumes on the
// next task) gives exactly what parseTableText gives: every bundled sample CSV and the special cases (comma decimals, a preamble, a banner,
// a space-separated table, comments, empty files, an identifier column, the subset paths that stay synchronous).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTableText, parseTableTextSliced } from "../src/lib/tabular.js";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..", "sample_data");
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

function csvFiles(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) csvFiles(p, out); else if (/\.(csv|txt)$/i.test(n) && statSync(p).size < 6e6) out.push(p); }
  return out;
}

test("every bundled sample CSV: the sliced read equals the plain read", { timeout: 180000 }, async () => {
  const files = csvFiles(root);
  assert.ok(files.length >= 30, `${files.length} files`);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    same(await parseTableTextSliced(text), parseTableText(text));
  }
});

test("special cases read the same; a big one pauses on the way", async () => {
  const cases = [
    "",
    "hole_id,from,to,Au\n",
    "hole_id;from;to;Au\nH1;0;1;1,5\nH1;1;2;2,25\n",
    "# exported by X\n# units: ppm\nhole_id,from,to,Au\nH1,0,1,0.5\n",
    "Report of drilling\nProject: Y\n\nhole_id,from,to,Au\nH1,0,1,0.5\nH2,0,2,1\n",
    "hole_id  from  to  Au\nH1  0  1  0.5\nH2  0  2  1\n",
    "sample_id,hole_id,from,to,Cu\n00123,H1,0,1,0.3\n00124,H1,1,2,\n",
    "hole_id,from,to,code\nH1,0,1,\"A,B\"\nH1,1,2,C\n",
    "hole_id,date,v\nH1,2024-01-02T03:04:05Z,1\nH1,2024-01-03T03:04:05Z,true\n",
  ];
  for (const c of cases) same(await parseTableTextSliced(c), parseTableText(c));
  // two malformed rows far into the file (a short one, a long one): their errors are numbered across the parts as in one read
  const big = "hole_id,from,to,Au,Cu,code\n" + Array.from({ length: 60000 }, (_, i) => (i === 41234 ? "H1,5,6" : i === 52000 ? "H1,5,6,1,2,X,extra" : `H${i % 97},${i},${i + 1},${(i % 31) / 10},${i % 7 ? (i % 13) / 100 : ""},${["AND", "BAS", "TUF"][i % 3]}`)).join("\n") + "\n";
  let yielded = 0;
  const tick = setInterval(() => { yielded++; }, 0);
  const sliced = await parseTableTextSliced(big);
  clearInterval(tick);
  const whole = parseTableText(big);
  same(sliced, whole);
  assert.equal(whole.errors.length, 2, "the two malformed rows");
  assert.ok(yielded > 0, "other tasks ran during the read");
  const quoted = big.replace("TUF", '"T,UF"');
  same(await parseTableTextSliced(quoted), parseTableText(quoted)); // a quote anywhere: read in one piece
});

test("the subset / composite / log / columnar reads go through parseTableText unchanged", async () => {
  const t = "hole_id,from,to,Au,Cu\nH1,0,1,0.5,0.1\nH2,0,2,1,0.2\nH1,1,2,0.7,0.3\n";
  for (const o of [{ keep: ["hole_id", "from", "to", "Au"] }, { holes: { col: "hole_id", ids: ["H1"] } }, { composite: { hole: "hole_id", from: "from", to: "to", lengthM: 2 } }])
    same(await parseTableTextSliced(t, o), parseTableText(t, o));
});

test("wiring: parseTableFile's main-thread read is the sliced one; both readers share the prologue and epilogue", () => {
  const s = readFileSync(new URL("../src/lib/tabular.js", import.meta.url), "utf8");
  assert.match(s, /return subsetNote\(encodingNote\(await parseTableTextSliced\(text, opts \|\| \{\}\), encoding\), opts\);/);
  assert.equal((s.match(/const prep = tablePrologue\(text, comments\);/g) || []).length, 2);
  assert.equal((s.match(/return tableEpilogue\(/g) || []).length, 2);
});
