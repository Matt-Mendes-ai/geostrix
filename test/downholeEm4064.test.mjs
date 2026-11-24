// TASKS.csv #4064 — the downhole EM reader (lib/downholeEm.js): the Maxwell table, the SMARTem receiver export, the SMARTem24 / DigiAtlantis export with LINE: separators,
// the Crone-to-Maxwell table with its .CHN file, and Crone PEM 210; the matching to project holes; the layers. Synthetic files of those shapes only (made-up numbers).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { downholeEmKind, readDownholeEm, parseChn, matchEmHoles, emLayerRows, stationIntervals, defaultChannel, symlog, sortComps, holesFromLayers } from "../src/lib/downholeEm.js";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const j = (...ls) => ls.join("\r\n") + "\r\n"; // the files are CRLF

const times = "0.1,0.2,0.4,0.8";
// (a) a Maxwell table: STATION, A / U / V per station, gate times as centres + widths
const maxwell = j(
  "TEM File Created by MAXWELL",
  "LINE:HOLE1 INSTRUMENT:CRONE DATATYPE:TEM CONFIG:DOWNHOLE UNITS:(nT/s) BFREQ:5.0 CURRENT:19.0 XCOLLAR:1000.0 YCOLLAR:2000.0 ZCOLLAR:300.0 &",
  "LOOP:#1 &",
  "LV1X:900.00 LV1Y:1900.00 LV1Z:300.00 &", "LV2X:1100.00 LV2Y:1900.00 LV2Z:300.00 &", "LV3X:1100.00 LV3Y:2100.00 LV3Z:300.00 &", "LV4X:900.00 LV4Y:2100.00 LV4Z:300.00",
  `/TIMES(ms)=${times}`, "/TIMESWIDTH(ms)=0.05,0.1,0.2,0.4",
  "      EAST        NORTH        LEVEL         ELEV      STATION    COMPONENT         GAIN             CH1             CH2             CH3             CH4",
  "  1000.0  2000.0  290.0  290.0  10.0  A  4.0  100.0  80.0  40.0  10.0",
  "  1000.0  2000.0  290.0  290.0  10.0  U  4.0  -5.0  -4.0  -2.0  -1.0",
  "  1000.0  2000.0  280.0  280.0  20.0  A  4.0  200.0  150.0  60.0  20.0",
  "  1000.0  2000.0  280.0  280.0  20.0  V  4.0  7.0  6.0  3.0  2.0",
  "  1000.0  2000.0  270.0  270.0  30.0  A  4.0  300.0  250.0  100.0  30.0",
);
// (a2) the same without a station column: depth from the receiver's position (a 65 degree hole)
const noStation = j(
  "TEM File Created by MAXWELL",
  "LINE:ABC009 DATATYPE:TEM CONFIG:DOWNHOLE DIP:90.0 AZIMUTH:0.0 UNITS:(pT/A) XCOLLAR:500.0 YCOLLAR:600.0 ZCOLLAR:100.0 &",
  `/TIMES(ms)=${times}`,
  "      EAST        NORTH        LEVEL         ELEV    COMPONENT         GAIN      NSTACKS             CH1             CH2             CH3             CH4",
  "  500.0  600.0  90.0  90.0  U  100.0  64.0  1.0  2.0  3.0  4.0",
  "  500.0  600.0  80.0  80.0  U  100.0  64.0  2.0  3.0  4.0  5.0",
);
// (b) a SMARTem receiver export: the column line before the time lines, start / end per gate, repeated readings, a file path in FLAGS
const smartem = j(
  "SMARTem V Atlantis:22 TEM data file - created Mon Jan 01 2001",
  "LINE:HOLE2  DATATYPE:TEM  INSTRUMENT:SMARTem  UNITS:(pT/A)  CONFIG:DOWNHOLE  BOREHOLE:HOLE2  XCOLLAR:10.0  YCOLLAR:20.0  ZCOLLAR:30.0",
  "STN LOOP RDNG ADC C NADC TIME FLAGS NCH CH1 CH2 CH3 CH4",
  "/TIMESSTART(ms)=0.0,0.1,0.3,0.7", "/TIMESEND(ms)=0.1,0.3,0.7,1.5",
  "100 1 100 1 A 3 1.5 C:\\data\\x.dat 4 10 8 6 4",
  "100 1 101 1 A 3 1.5 C:\\data\\x.dat 4 14 12 10 8",
  "100 1 100 2 U 3 1.5 C:\\data\\x.dat 4 -1 -2 -3 -4",
  "110 1 102 1 A 3 1.5 C:\\data\\x.dat 4 20 18 16 14",
);
// (c) a SMARTem24 / DigiAtlantis export holding two holes behind LINE: separator rows, with positions per row
const multi = j(
  "EXPORTED SMARTem24 Atlantis:4 TEM data file SETTINGSFILENAME:HOLE3 Application Version: 1.0",
  "DATATYPE:TEM  RECEIVER:DigiAtlantis  LINE:MULTI  CONFIG:Downhole  LOOP:L1  XCOLLAR:0.0  YCOLLAR:0.0  ZCOLLAR:50.0",
  "STN RDNG EAST NORTH RL LOOP ADC C NADC TIME CH1 CH2 CH3 CH4",
  "/TIMESSTART(ms)=0.0,0.1,0.3,0.7", "/TIMESEND(ms)=0.1,0.3,0.7,1.5",
  "LINE:HOLE3",
  "10 1 0 0 40 L1 1 A 3 t 5 4 3 2", "10 1 0 0 40 L1 2 U 3 t 1 1 1 1",
  "LINE:HOLE4",
  "20 1 5 5 30 L1 1 A 3 t 9 8 7 6",
);
// (d) a Crone-to-Maxwell table: the gate times are in a .CHN named by the header; VPRI is the primary field
const croneTable = j(
  "Some Mine - BOREHOLE PEM SURVEY",
  "DATATYPE:TEM UNITS:(nT/s) CHANNELFILE:H5Z.CHN &",
  "NUMTIMES:4 HOLE:H-005 LOOP:P1 TURNS:1 CONFIG:DOWNHOLE &",
  "LV3X:10 LV3Y:20 LV3Z:0 &", "LV2X:10 LV2Y:0 LV2Z:0 &", "LV1X:0 LV1Y:0 LV1Z:0 &", "LV4X:0 LV4Y:20 LV4Z:0 &",
  "RAMP=1.00 INITDELAY:0.8960",
  "\\PLEASE CHECK COMPONENT DEFINITIONS",
  "STN  C  VPRI  CH1  CH2  CH3  CH4",
  "10    A     35040     -10720     -9046     -7095     -5449",
  "20    A     34240     6254      5794      5417      5239",
);
const chn = j("Crone 50.00 msec time base;  FREQUENCY:5.00Hz", "NUMTIMES:4           OFFTIME:50.00", "DELAY                 WIDTH", "0.05200               0.0080", "0.06400               0.0160", "0.07800               0.0120", "0.09400               0.0200");
// Crone PEM 210: tags, the time block in seconds (two extra values in front), the '$' line, then a record per station and component
const pem = j(
  "<FMT> 210                       ~ data format", "<UNI> nanoTesla/sec             ~ data units", "<OPR> Someone               ~ operator's name", "<XYP> 0 92 5 501                ~ probe",
  "<CUR> 25.0                      ~ peak current", "<TXS> 400.0 400.0 0             ~ loop size",
  "<L00> 100.0 200.0 0.0 0  ~ loop coord.", "<L01> 100.0 0.0 0.0 0  ~ loop coord.", "<L02> 300.0 0.0 0.0 0  ~ loop coord.", "<L03> 300.0 200.0 0.0 0  ~",
  "<P00> 200.0 100.0 5.0 0  ~ 0=Collar/Start", "<P01> 270.0 60.0 480.0 2        ~|segments",
  "Some Mine", "Some Prospect", "PEM-010", "PE10", "Jul 16, 2007",
  "Borehole Metric Crystal-Master 50.00 1000 4 48", "#105 6.06 SEP22,2005 PEM10Z N 1000 6500 +", "",
  "-2.000e-04 -1.000e-04  4.800e-05  1.000e-04  2.000e-04  4.000e-04  8.000e-04", "$",
  "10 ZR0 0 A 1396.0 90 512 1 0", "D7 0 0 0 0 0 0 0", " 3.504e+04  4.211e+04  4.223e+04  4.221e+04  4.201e+04", "",
  "10 XR0 0 A 1396.0 90 512 1 0", "D7 0 0 0 0 0 0 0", " 1.0e+03  -5.0e+02  -2.0e+02  -1.0e+02  -5.0e+01", "",
  "20 ZR0 0 A 1396.0 90 512 1 1", "D7 0 0 0 0 0 0 0", " 3.424e+04  4.176e+04  4.204e+04  4.227e+04  4.238e+04", "",
  "20 ZR1 0 A 1396.0 90 512 1 2", "D7 0 0 0 0 0 0 0", " 3.424e+04  4.176e+04  4.204e+04  4.227e+04  4.238e+04", "",
);

test("kinds: what a file is, from its head", () => {
  assert.equal(downholeEmKind(maxwell), "maxwell"); assert.equal(downholeEmKind(smartem), "maxwell"); assert.equal(downholeEmKind(multi), "maxwell");
  assert.equal(downholeEmKind(croneTable), "maxwell"); assert.equal(downholeEmKind(pem), "pem"); assert.equal(downholeEmKind(chn), "chn");
  assert.equal(downholeEmKind(pem.replace("Borehole Metric", "Surface Metric")), "pem-surface");
  assert.equal(downholeEmKind("TEM File Created by MAXWELL\nLINE:L1 CONFIG:IN UNITS:(nT/s)\nSTATION COMPONENT CH1 CH2\n"), null, "a surface file is not downhole");
  assert.equal(downholeEmKind("/X Y Z RAWMAG\n1 2 3 4\n"), null);
});

test("(a) a Maxwell table: stations, components, gate times from centres + widths, the loop and the collar, one mean per depth", () => {
  const r = readDownholeEm(maxwell, "HOLE1.tem");
  assert.equal(r.holes.length, 1); const h = r.holes[0];
  assert.equal(h.id, "HOLE1"); assert.deepEqual(h.collar, { x: 1000, y: 2000, z: 300 }); assert.equal(h.loop.length, 4);
  assert.equal(r.units, "nT/s"); assert.equal(r.nch, 4);
  assert.deepEqual(Object.keys(h.comps).sort(), ["A", "U", "V"]);
  assert.deepEqual(h.comps.A.map((s) => s.depth), [10, 20, 30]); assert.deepEqual(h.comps.A[0].values, [100, 80, 40, 10]);
  assert.deepEqual(h.comps.U.map((s) => s.depth), [10], "a station may miss a component");
  assert.deepEqual(r.times.centres, [0.1, 0.2, 0.4, 0.8]); assert.deepEqual(r.times.widths, [0.05, 0.1, 0.2, 0.4]);
  assert.equal(h.comps.A[0].x, 1000); // the receiver's position at that depth
});

test("(a2) no station column: the depth is the distance from the collar to the receiver, and it says so", () => {
  const r = readDownholeEm(noStation, "x.tem");
  assert.deepEqual(r.holes[0].comps.U.map((s) => s.depth), [10, 20]);
  assert.ok(r.warnings.some((w) => /no station \(depth\) column/.test(w)));
  assert.equal(r.units, "pT/A"); assert.equal(r.holes[0].dip, 90);
});

test("(b) a SMARTem receiver export: the column line first, start / end gate times, repeated readings averaged, a path in FLAGS", () => {
  const r = readDownholeEm(smartem, "cr.txt");
  const h = r.holes[0];
  assert.equal(h.id, "HOLE2"); assert.deepEqual(r.times.centres, [0.05, 0.2, 0.5, 1.1]); assert.deepEqual(r.times.widths.map((w) => +w.toFixed(3)), [0.1, 0.2, 0.4, 0.8]);
  assert.deepEqual(h.comps.A[0].values, [12, 10, 8, 6], "two readings at 100 m: their mean"); assert.equal(h.comps.A[0].reads, 2);
  assert.deepEqual(h.comps.U[0].values, [-1, -2, -3, -4]); assert.equal(r.units, "pT/A");
  assert.equal(r.skipped, 0, "every row had the header's token count, the path included");
});

test("(c) a SMARTem24 / DigiAtlantis export: LINE: rows start each hole (the header's LINE is MULTI)", () => {
  const r = readDownholeEm(multi, "m.tem");
  assert.deepEqual(r.holes.map((h) => h.id), ["HOLE3", "HOLE4"]);
  assert.deepEqual(r.holes[0].comps.A[0].values, [5, 4, 3, 2]); assert.deepEqual(r.holes[1].comps.A[0].values, [9, 8, 7, 6]);
  assert.equal(r.holes[1].comps.U, undefined);
  assert.equal(r.holes[0].comps.A[0].z, 40); // RL of the receiver
});

test("(d) a Crone-to-Maxwell table: the .CHN file gives the gate times; without it the file says where they are", () => {
  const c = parseChn(chn); assert.equal(c.centres.length, 4); assert.ok(Math.abs(c.centres[0] - 0.056) < 1e-9); assert.deepEqual(c.widths, [0.008, 0.016, 0.012, 0.02]);
  const r = readDownholeEm(croneTable, "H5Z.TEM", { "H5Z.CHN": chn });
  assert.equal(r.holes[0].id, "H-005"); assert.equal(r.times.source, "the .CHN file"); assert.equal(r.holes[0].comps.A[0].values[0], -10720);
  assert.equal(r.holes[0].loop.length, 4);
  const no = readDownholeEm(croneTable, "H5Z.TEM", {});
  assert.equal(no.times, null); assert.match(no.timesNote, /gate times are in H5Z\.CHN: open it with the file/);
  const bad = readDownholeEm(croneTable, "H5Z.TEM", { "h5z.chn": chn.replace("NUMTIMES:4", "") + "0.1 0.1\r\n" }); // a .CHN with five gates against four channels
  assert.equal(bad.times, null); assert.ok(bad.warnings.some((w) => /has 5 gates, the readings have 4/.test(w)));
});

test("Crone PEM 210: the tags, the time block's last gates, X / Y / Z records, the hole path", () => {
  const r = readDownholeEm(pem, "PEM10Z.PEM");
  const h = r.holes[0];
  assert.equal(h.id, "PEM-010"); assert.equal(r.nch, 4); assert.equal(r.units, "nT/s");
  assert.deepEqual(r.times.centres.map((t) => +t.toFixed(4)), [0.1, 0.2, 0.4, 0.8], "seconds to ms; the first two values are not gates");
  assert.deepEqual(h.collar, { x: 200, y: 100, z: 5 }); assert.equal(h.azimuth, 270); assert.equal(h.dip, 60); assert.equal(h.loop.length, 4);
  assert.deepEqual(Object.keys(h.comps).sort(), ["X", "Z"]);
  assert.deepEqual(h.comps.Z.map((s) => s.depth), [10, 20]); assert.deepEqual(h.comps.Z[0].values, [4.211e4, 4.223e4, 4.221e4, 4.201e4], "the first value is the primary field");
  assert.equal(h.comps.Z[1].reads, 2, "two readings at 20 m averaged");
});

test("refusals that say why: a surface PEM profile, a lone .CHN, a file that is no downhole EM", () => {
  assert.throws(() => readDownholeEm(pem.replace("Borehole Metric", "Surface Metric"), "x.pem"), /surface PEM profile .* not a hole/);
  assert.throws(() => readDownholeEm(chn, "x.chn"), /channel-time file/);
  assert.throws(() => readDownholeEm("/X Y Z\n1 2 3\n", "x.xyz"), /not a downhole EM file/);
  assert.throws(() => readDownholeEm(j("TEM File Created by MAXWELL", "LINE:H CONFIG:DOWNHOLE UNITS:(nT/s)", "STATION COMPONENT CH1 CH2 CH3 CH4", "10 A 1 2"), "x.tem"), /no readings were found/);
});

test("matching the file's holes to the project's: case, zeros, separators, loop and repeat suffixes, a unique prefix", () => {
  const proj = ["ALRC007", "PENQ10", "13ALDD018", "SQ31", "MN-005", "TTD0002", "LSD0003", "AB1", "AB12"];
  const m = Object.fromEntries(matchEmHoles(["ALRC007", "alrc 007", "PENQ-010", "13ALDD018_L1605", "SQ31_1", "MN005", "TTD0002", "LSD0003_LS_DHEM2017_1", "NOPE1", "Hole TTD0002"], proj).map((x) => [x.id, x]));
  assert.deepEqual([m.ALRC007.hole, m.ALRC007.how], ["ALRC007", "exact"]);
  assert.equal(m["alrc 007"].hole, "ALRC007"); assert.equal(m["PENQ-010"].hole, "PENQ10");
  assert.deepEqual([m["13ALDD018_L1605"].hole, m["13ALDD018_L1605"].how], ["13ALDD018", "name with a suffix"]);
  assert.equal(m.SQ31_1.hole, "SQ31"); assert.equal(m.MN005.hole, "MN-005"); assert.equal(m.LSD0003_LS_DHEM2017_1.hole, "LSD0003");
  assert.equal(m["Hole TTD0002"].hole, "TTD0002"); assert.equal(m.NOPE1.hole, null);
  // two project holes that squash to one name are not guessed; a prefix that fits two holes is not guessed
  assert.equal(matchEmHoles(["AB-1"], ["AB_1", "AB.1"])[0].hole, null);
  assert.equal(matchEmHoles(["ABCD12X"], ["ABCD1", "ABCD12"])[0].hole === null || matchEmHoles(["ABCD12X"], ["ABCD1", "ABCD12"])[0].hole === "ABCD12", true);
});

test("the layer rows: an interval around each station, the chosen channel as the value, every channel kept, the project's hole id", () => {
  const r = readDownholeEm(maxwell, "HOLE1.tem");
  const rows = emLayerRows(r.holes, "A", 2, (h) => "PROJ-1");
  assert.equal(rows.length, 3); assert.equal(rows[0].hole_id, "PROJ-1");
  assert.deepEqual([rows[0].depth, rows[0].from, rows[0].to, rows[0].value, rows[0].CH1, rows[0].CH4, rows[0].n], [10, 5, 15, 80, 100, 10, 1]);
  assert.deepEqual([rows[1].from, rows[1].to], [15, 25]); assert.deepEqual([rows[2].from, rows[2].to], [25, 35]);
  assert.deepEqual(stationIntervals([{ depth: 10 }, { depth: 11 }, { depth: 200 }]).map((x) => [x.from, x.to]), [[9.5, 10.5], [10.5, 16], [195, 200.5]], "a gap is capped at five times the usual spacing; the last station takes half the usual spacing");
  assert.equal(emLayerRows(r.holes, "V", 1)[0].value, 7);
  assert.equal(defaultChannel(4), 2); assert.equal(defaultChannel(36), 22); assert.equal(defaultChannel(1), 1);
  assert.deepEqual(sortComps(["V", "U", "A"]), ["A", "U", "V"]); assert.deepEqual(sortComps(["Y", "X", "Z"]), ["Z", "X", "Y"]);
  assert.ok(symlog(-100, 1) < 0 && symlog(0, 1) === 0 && Math.abs(symlog(100, 1) + symlog(-100, 1)) < 1e-12);
});

test("layers keep what the pane needs after a save: the channels as columns, the gate times in `em`", () => {
  const r = readDownholeEm(maxwell, "HOLE1.tem");
  const layer = { id: "custom_em_hole1_A", name: "x", rows: emLayerRows(r.holes, "A", 2), em: { component: "A", nch: 4, times: r.times.centres, units: "nT/s", file: "HOLE1", valueChannel: 2 } };
  const back = holesFromLayers([layer, { id: "other", rows: [{ hole_id: "q", depth: 1, value: 2 }] }]);
  assert.equal(back.length, 1); assert.equal(back[0].id, "HOLE1"); assert.deepEqual(back[0].comps.A[1].values, [200, 150, 60, 20]); assert.deepEqual(back[0].times, [0.1, 0.2, 0.4, 0.8]); assert.equal(back[0].nch, 4);
});

test("wired: the pane, the EM menu, the tab's drop, the help page, the refusals that point to it; no plate modelling claimed", () => {
  const g = read("src/modules/GeophysicsModule.jsx"), p = read("src/components/BoreholeEmPane.jsx"), help = read("src/lib/help.js"), em = read("src/lib/boreholeEm.js");
  assert.match(g, /const BoreholeEmPane = React\.lazy\(\(\) => import\("\.\.\/components\/BoreholeEmPane\.jsx"\)\);/);
  assert.match(g, /geoPane === "bhem" && \(<Suspense fallback=\{null\}><BoreholeEmPane collars=\{collars\} customLayers=\{customLayers\} setCustomLayers=\{setCustomLayers\} pendingFiles=\{bhemDrop\}/);
  assert.match(g, /go: \(\) => setGeoPane\("bhem"\), help: "borehole-em"/);
  assert.match(g, /if \(bhems\.length\) \{ setBhemDrop\(bhems\); setGeoPane\("bhem"\); \}/);
  assert.match(g, /const xyzs = xyzAll\.filter\(\(f\) => !wbs\.includes\(f\) && !bhems\.includes\(f\)\);/);
  assert.match(help, /"Borehole EM \(downhole\)": "borehole-em"/);
  assert.match(p, /<TaskPaneHeader title=\{tr\("Borehole EM \(downhole\)"\)\}/);
  assert.match(p, /It does not model conductor plates\./);
  assert.match(em, /Read it with EM › Borehole EM\./); assert.doesNotMatch(em, /no reader for borehole EM yet/);
  assert.match(p, /setCustomLayers\(\(p\) => \{/, "the layers go in as custom numeric layers: the Strip log and the 3D View read them like any log");
  assert.match(p, /em: \{ component: c, nch: f\.nch, times: f\.times\?\.centres \|\| null/);
});

test("one receiver-text parser: the downhole reader is built on the ground TEM one; a hole's own-header refusal points to the pane", async () => {
  const d = read("src/lib/downholeEm.js"), m = read("src/lib/maxwellTem.js");
  assert.match(d, /import \{ parseTemReceiver \} from "\.\/maxwellTem\.js";/);
  assert.doesNotMatch(d, /function headerKeys|function timesOf/, "no second table parser in downholeEm.js");
  assert.match(m, /export function parseTemReceiver\(text, opts = \{\}\)/);
  const { boreholeHeaderRefusal } = await import("../src/lib/boreholeEm.js");
  assert.match(boreholeHeaderRefusal("x.tem", "LINE:1 BOREHOLE:DH1"), /not a hole\. Read it with EM › Borehole EM\./);
  // the shared parser, asked not to place lines: a table with a station column and no coordinates keeps NaN positions; widths and read counts come back
  const { parseTemReceiver } = await import("../src/lib/maxwellTem.js");
  const t = ["TEM File Created by MAXWELL", "BOREHOLE:H1 CONFIG:DOWNHOLE", "/TIMES(ms)=0.1 0.2 0.4 0.8", "/TIMESWIDTH(ms)=0.1 0.1 0.2 0.4", "STATION COMPONENT CH1 CH2 CH3 CH4", "10 A 1 2 3 4", "10 A 3 4 5 6", "20 A 1 1 1 1"].join("\r\n");
  const r = parseTemReceiver(t, { placeLines: false, lineDefault: (h) => h.BOREHOLE });
  assert.equal(r.positions, "none"); assert.equal(r.hasStation, true); assert.deepEqual(r.widths, [0.1, 0.1, 0.2, 0.4]);
  assert.equal(r.stations.length, 2); assert.equal(r.stations[0].line, "H1"); assert.deepEqual(r.stations[0].reads, { A: 2 }); assert.deepEqual(Array.from(r.stations[0].comps.A), [2, 3, 4, 5]);
  assert.equal(r.timesListed, 4); assert.equal(r.skipped, 0);
});
