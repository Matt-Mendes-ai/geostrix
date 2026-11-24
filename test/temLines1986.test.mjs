// TASKS.csv #1986 step 1 — multi-channel TEM line data: the channels found, the gate times read, a station's decay constant, tau everywhere
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { temChannelGroups, gateTimesFromText, toMs, readTemText, channelMatrix, linesOf, decayTau, tauAll, numbersIn } from "../src/lib/temLines.js";

// a SYNTHETIC SkyTEM-like Aarhus Workbench export: 3 lines 200 m apart, a station every 25 m, 20 gates from 0.01 to 3 ms (written in
// seconds as Workbench does), V = C exp(-t / tau) with tau 0.3 ms in the background and 1.5 ms over a conductor at (1000, 200)
const T = Array.from({ length: 20 }, (_, k) => 0.01 * 300 ** (k / 19)); // ms, log-spaced 0.01 .. 3
export function syntheticWorkbench({ dummyAt = null } = {}) {
  const tauAt = (x, y) => 0.3 + 1.2 * Math.exp(-((x - 1000) ** 2 + (y - 200) ** 2) / (2 * 150 ** 2));
  const cols = ["LINE_NO", "UTMX", "UTMY", "TOPO", ...T.map((_, k) => `DBDT_CH1GT${k + 1}`), ...T.map((_, k) => `DBDT_STD_CH1GT${k + 1}`)];
  const out = ["/INFO", "/ SYNTHETIC export, Aarhus Workbench layout (test data, not a survey)", "/DUMMY", "/9999", "/COORDINATE SYSTEM", "/ UTM zone 9N, epsg:32609",
    "/GATE TIMES CHANNEL 1", "/ " + T.map((t) => (t / 1000).toExponential(4)).join(" "), "/ " + cols.join(" ")];
  for (let l = 0; l < 3; l++) for (let i = 0; i <= 80; i++) {
    const x = i * 25, y = l * 200, tau = tauAt(x, y);
    const v = T.map((t) => 1e3 * Math.exp(-t / tau));
    const row = [100 + l, x + 352000, y + 6335000, 600, ...v.map((a) => a.toExponential(5)), ...v.map(() => "0.03")];
    if (dummyAt && dummyAt[0] === l && dummyAt[1] === i) row[4 + 19] = 9999;
    out.push(row.join(" "));
  }
  return out.join("\n");
}

test("#1986 channel groups: array channels, Workbench gates, the uncertainty last, X / Y / line never a group", () => {
  const g = temChannelGroups(["X", "Y", "Z", "Line", ...Array.from({ length: 30 }, (_, k) => `dBdt_Z[${k}]`), "fid"]);
  assert.equal(g.length, 1); assert.equal(g[0].prefix, "dBdt_Z"); assert.equal(g[0].cols.length, 30); assert.equal(g[0].cols[0], "dBdt_Z[0]");
  const w = temChannelGroups(["LINE_NO", ...Array.from({ length: 12 }, (_, k) => `DBDT_STD_CH1GT${k + 1}`), ...Array.from({ length: 12 }, (_, k) => `DBDT_CH1GT${k + 1}`), ...Array.from({ length: 8 }, (_, k) => `DBDT_CH2GT${k + 3}`)]);
  assert.deepEqual(w.map((x) => [x.prefix, x.cols.length, x.aux]), [["DBDT_CH1GT", 12, false], ["DBDT_CH2GT", 8, false], ["DBDT_STD_CH1GT", 12, true]]);
  assert.deepEqual(w[1].idx, [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(temChannelGroups(["X1", "X2", "Y1", "Y2", "Z1"]).length, 0);
  assert.deepEqual(temChannelGroups(["CH1", "CH2", "CH3", "CH10", "CH11"]).map((x) => x.cols), [["CH1", "CH2", "CH3", "CH10", "CH11"]]); // numeric order
});

test("#1986 gate times from a header, in seconds or milliseconds", () => {
  assert.deepEqual(toMs([1e-5, 2e-5, 4.5e-5]), [0.01, 0.02, 0.045]);
  assert.deepEqual(toMs([0.01, 0.5, 3]), [0.01, 0.5, 3]);
  const t = gateTimesFromText("/ some header\n/ Gate times (s): 1.0e-05 2.0e-05\n/ 3.0e-05 5.0e-05 8.0e-05\nLine 10\n1 2 3", 5);
  assert.deepEqual(t, [0.01, 0.02, 0.03, 0.05, 0.08]);
  assert.equal(gateTimesFromText("/ X Y CH1 CH2 CH3 CH4\n1 2 3 4 5 6", 4), null);
  assert.deepEqual(numbersIn("a 1.5e-3, -2 .5"), [0.0015, -2, 0.5]);
});

test("#1986 decayTau: the late-time decay constant of an exponential, noise and negative readings left out", () => {
  const tau = 0.8, v = T.map((t) => 500 * Math.exp(-t / tau));
  const r = decayTau(T, v);
  assert.ok(Math.abs(r.tau - tau) < 1e-9, String(r.tau)); assert.ok(r.r2 > 0.999999); assert.equal(r.to, 19); assert.ok(r.n >= 3);
  const noisy = v.map((x, k) => (k > 16 ? -1 : x)); // the last gates in the noise (negative)
  assert.ok(Math.abs(decayTau(T, noisy).tau - tau) < 1e-9);
  assert.equal(decayTau(T, T.map(() => -1)), null);
  assert.equal(decayTau(T, T.map((t) => t)), null); // rising: no decay
  assert.equal(decayTau([0.1, 0.2], [5, 2]), null);
});

test("#1986 a Workbench TEM export: positions, lines, the gate times from its header, tau over the conductor", () => {
  const d = readTemText(syntheticWorkbench({ dummyAt: [1, 40] }), "SYNTHETIC_skytem_dat.xyz");
  assert.equal(d.source, "Aarhus Workbench / SkyTEM .xyz"); assert.equal(d.epsg, 32609); assert.equal(d.n, 243);
  assert.equal(d.groups[0].prefix, "DBDT_CH1GT"); assert.equal(d.xCol, "UTMX"); assert.equal(d.zCol, "TOPO");
  const times = d.gateTimes(d.groups[0]);
  assert.equal(times.length, 20); assert.ok(Math.abs(times[0] - 0.01) < 1e-9 && Math.abs(times[19] - 3) < 1e-6);
  const L = linesOf(d);
  assert.deepEqual(L.map((l) => l.key), ["100", "101", "102"]); assert.equal(L[0].d[80], 2000);
  const mat = channelMatrix(d, d.groups[0]);
  assert.ok(Number.isNaN(mat.v[(81 + 40) * 20 + 19])); // the dummy value is NaN
  const { tau, fitted } = tauAll(mat, times);
  assert.equal(fitted, 243);
  const at = (l, i) => tau[l * 81 + i];
  assert.ok(Math.abs(at(1, 40) - 1.5) < 1e-3, String(at(1, 40))); // over the conductor (its last gate a dummy)
  assert.ok(Math.abs(at(0, 0) - 0.3) < 1e-3);
  assert.ok(at(1, 40) > at(0, 40) && at(0, 40) > at(0, 0));
});

test("#1986 a Geosoft .xyz with array channels and a CSV read the same way", () => {
  const lines = ["/ gate times (ms): 0.1 0.2 0.4 0.8 1.6 3.2", "/ X Y Elevation " + Array.from({ length: 6 }, (_, k) => `dBdt_Z[${k}]`).join(" "), "Line 10"]; // comments before the header, as Geosoft writes them
  for (let i = 0; i < 5; i++) lines.push(`${i * 10} 0 300 ${[0.1, 0.2, 0.4, 0.8, 1.6, 3.2].map((t) => (100 * Math.exp(-t / 0.5)).toFixed(6)).join(" ")}`);
  const g = readTemText(lines.join("\n"), "SYN.xyz");
  assert.equal(g.source, "Geosoft .xyz"); assert.deepEqual(g.gateTimes(g.groups[0]), [0.1, 0.2, 0.4, 0.8, 1.6, 3.2]); assert.equal(g.line[0], "10");
  const r = decayTau(g.gateTimes(g.groups[0]), Array.from(channelMatrix(g, g.groups[0]).v.slice(0, 6)));
  assert.ok(Math.abs(r.tau - 0.5) < 1e-3);
  const csv = ["x,y,line,ch1,ch2,ch3,ch4", "0,0,1,10,5,2,1", "10,0,1,10,5,2,1"].join("\n");
  const c = readTemText(csv, "SYN.csv");
  assert.equal(c.source, "CSV"); assert.equal(c.groups[0].prefix, "ch"); assert.equal(c.gateTimes(c.groups[0]), null); // no times: typed in the pane
  assert.throws(() => readTemText("x,y,a,b\n1,2,3,4", "no.csv"), /No TEM channels/);
});

test("#1986 the EM chooser opens TEM line data, a lazy pane with its help page", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /const TemPane = React\.lazy\(\(\) => import\("\.\.\/components\/TemPane\.jsx"\)\);/);
  assert.match(g, /go: \(\) => setGeoPane\("tem"\), help: "tem-lines" \}/);
  assert.match(g, /\{geoPane === "tem" && \(<Suspense fallback=\{null\}><TemPane /);
  assert.match(g, /active=\{geoPane === "em" \|\| geoPane === "fdem" \|\| geoPane === "tem" \|\| geoPane === "bhem"\}/);
  const h = readFileSync(new URL("../src/lib/help.js", import.meta.url), "utf8");
  assert.match(h, /"TEM line data \(multi-channel\)": "tem-lines"/);
  const p = readFileSync(new URL("../src/help/pages/geophysics.js", import.meta.url), "utf8");
  assert.match(p, /id: "tem-lines"/);
  const pane = readFileSync(new URL("../src/components/TemPane.jsx", import.meta.url), "utf8");
  assert.match(pane, /updateGeophysSurvey\(name, \{ method: "em_tau", units: SURVEY_METHODS\.em_tau\.units \}\)/);
  assert.doesNotMatch(pane, /from "lucide-react"/); // icons from icons.js only (a new lucide icon grows the startup chunk)
});
