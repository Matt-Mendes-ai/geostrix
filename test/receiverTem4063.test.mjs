// TASKS.csv #4063 (found by side 2's inventory of 28 Queensland open-file reports) — ground TEM files from other receivers than Maxwell's export were refused
// ('No X / Y columns', 'No TEM channels'): the Crone 'SURFACE PEM SURVEY' text, SMARTem V receiver files (no coordinates), SMARTem24 exports, Zonge EMBASE.
// They are read now, placed on their line when they have no coordinates, and a hole's file says in words that it is one. Every file here is made up,
// with the shape of the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReceiverTem, parseTemReceiver, placeLine, placeAlongLine } from "../src/lib/maxwellTem.js";
import { readTemText, linesOf, channelMatrix } from "../src/lib/temLines.js";
import { boreholeHeaderRefusal } from "../src/lib/boreholeEm.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NG = 10;
const ch = (n) => Array.from({ length: n }, (_, i) => `CH${i + 1}`);
const decay = (amp, k = 0) => Array.from({ length: NG }, (_, i) => (amp * Math.exp(-i / 3) + k).toExponential(6));

// Crone 'SURFACE PEM SURVEY': the loop's corners in the header, STN C VPRI CH1 ..., no gate times
function crone({ line = "7554100E", config = "FIXEDLOOP", corners = [[460400, 7554000], [460400, 7554200], [460600, 7554200], [460600, 7554000]], stns = [460500, 460700, 460900, 461100], title = "Example Exploration Ltd - SURFACE PEM SURVEY" } = {}) {
  const L = [title, "DATATYPE:TEM UNITS:(nT/s) CHANNELFILE:7554100N.CHN &", `NUMTIMES:${NG} LINE:${line} LOOP:Moving TURNS:1 CONFIG:${config} &`, "INSTRUMENT:CRONE FREQUENCY:USER &"];
  corners.forEach(([x, y], i) => L.push(`LV${i + 1}X:${x} LV${i + 1}Y:${y} LV${i + 1}Z:0 &`));
  L.push("CURRENT:15 RXAREA:4100 TXAREA:40000.0 &", "RAMP=1.00 INITDELAY:1.0075", "\\PLEASE CHECK COMPONENT DEFINITIONS", ["STN", "C", "VPRI", ...ch(NG)].join("  "));
  for (const s of stns) L.push([String(s), "Z", "65070", ...decay(60000).map((v) => Number(v).toFixed(0))].join("     "));
  return L.join("\r\n") + "\r\n";
}
// SMARTem V: STN LOOP RDNG ADC C NADC TIME ... NCH CH1 ...; each reading twice (ADC 1 at gain 1, ADC 2 at gain 40), three readings per station
function smartemV({ line = "7547900" } = {}) {
  const L = ["SMARTem V TEM data file - created Wed May 24 12:59:21 2006", `LINE:${line}  DATATYPE:TEM  INSTRUMENT:SMARTem  UNITS:(uV/A)  CONFIG:INLOOP  RXAREA:10000  INITDELAY:0.150  TRANSMITTER:GGT-30  LSIDE:200`,
    ["STN", "LOOP", "RDNG", "ADC", "C", "NADC", "TIME", "OPERATOR", "FREQ", "CURR", "SAMP_RATE", "GAIN", "NSTACKS", "DIR", "FLAGS", "SFTHRES", "RAMP", "DELAY", "NOISE", "NCH", ...ch(NG), "COMMENT"].join(" ")];
  const starts = Array.from({ length: NG }, (_, i) => (0.1 * (i + 1) * (i + 1)).toFixed(2)), ends = Array.from({ length: NG }, (_, i) => (0.1 * (i + 2) * (i + 2)).toFixed(2));
  L.push(`/TIMESSTART(ms)=${starts.join(",")}`, `/TIMESEND(ms)=${ends.join(",")}`);
  for (const stn of [464500, 464550, 464600]) for (let r = 0; r < 3; r++) for (const [adc, gain, amp] of [[1, "1.0", 100000], [2, "40.0", 4500]]) {
    const vals = adc === 1 ? decay(amp, r * 10) : Array(NG).fill("4.5000e+03");
    L.push([stn, 1, 500 + r, adc, "Z", 2, "6052510.06", "Reg", "1.562500", "20.000", "25000.000", gain, 256, "C:\\2604", "01100110536200120120", "20.0", "0.15", "0.10", "3.649439e-01", NG, ...vals, "."].join(" "));
  }
  return L.join("\r\n") + "\r\n";
}
// SMARTem24 'EXPORTED' file: coordinates in the file, the component from C (an ADC for each), several lines
function smartemExport({ config = "Fixed_Loop" } = {}) {
  const cols = ["STN", "RDNG", "EAST", "NORTH", "RL", "LOOP", "ADC", "C", "NADC", "UNITS", "NCH", ...ch(NG)];
  const L = ["EXPORTED SMARTem24 TEM data file SETTINGSFILENAME:Example Application Version:10.11", `DATATYPE:TEM  RECEIVER:SMARTem24  LINE:MULTI  CONFIG:${config}  LOOP:L1_actual  TX:Geonics  PROSPECT:Example`, cols.join(" "),
    `/TIMESSTART(ms)=${Array.from({ length: NG }, (_, i) => (0.1 * (i + 1)).toFixed(3)).join(",")}`, `/TIMESEND(ms)=${Array.from({ length: NG }, (_, i) => (0.1 * (i + 2)).toFixed(3)).join(",")}`,
    "/Loops coordinates, 307394.195\t8080801.765\t804.77, 307875.694\t8081148.14\t844.01, 308223.699\t8080651.702\t811.16, 307731.34\t8080316.467\t791.81", "LINE:0.00"];
  for (const stn of ["0.00", "25.00"]) for (let r = 0; r < 2; r++) for (const [adc, c] of [[1, "X"], [2, "Y"], [3, "Z"]]) L.push([stn, r, 307870 + Number(stn), 8080685.02, 801.64, "L1_actual", adc, c, 3, "pT/A", NG, ...decay(c === "Z" ? 3000 : 300)].join(" "));
  return L.join("\r\n") + "\r\n";
}
// Zonge EMBASE: KEY=VALUE header, '\ TIMES=', '\RAW' blocks beside the processed rows, a local grid, no component column
function embase() {
  const L = ["EM DATA FROM : 49800E.mdb (EMBASE  V1.14) 15/10/1997 DATA : RVR1E", `UNITS=() INSTRUMENT=GDP-16 TXAREA=40000 TURNS=1 RMP=0.000 INITDELAY=0.062 LSIDE=200 CHANNELFILE=49800ERV.chn NCH=${NG} RXAREA=10000 ARRAY=INL C=I FREQ=1.0000 F=U LINE=49800E`,
    ["STN", "CUR", ...ch(NG)].map((h) => h.padStart(11)).join(" "), "\\ TIMES=  " + Array.from({ length: NG }, (_, i) => (0.2 * (i + 1)).toFixed(4)).join("  "), "\\", "\\ JOB=362 VERSION=0527"];
  for (const stn of [43600, 43650, 43700]) { L.push("\\ BLOCK=0130 DATE=6/10/97 TIME=14:15:57 GAIN=O050 CYCLES=256"); L.push(`\\RAW  ${stn}   16.0 ` + decay(9000).join(" ")); L.push(`      ${stn}   16.0 ` + decay(9000).join(" ")); }
  return L.join("\r\n") + "\r\n";
}
// a hole's tool log: no decay channels, a hole and its collar in the header
const atlantisLog = ["Atlantis:22 data file - created Fri Jun 09 06:16:43 2006", "LINE:Hole0003  DATATYPE:TEM  INSTRUMENT:SMARTem  XCOLLAR:467430.0  YCOLLAR:7553540.0  ZCOLLAR:241.0", "STN LOOP RDNG ADC C NADC TIME GAIN LOCBATT PRBBATT ACC1 ACC2", "20 1 745 1 A 3 6060911.03 1 9.1 8.2 0.1 0.2", "40 1 744 1 A 3 6060910.58 1 9.1 8.2 0.1 0.2"].join("\r\n");

test("a receiver-text TEM file is recognised by its column header (STN / EAST first, four or more gates), not by its title", () => {
  for (const t of [crone(), smartemV(), smartemExport(), embase()]) assert.equal(isReceiverTem(t), true);
  assert.equal(isReceiverTem("X Y Z\n1 2 3\n"), false); assert.equal(isReceiverTem("/ X Y CH1 CH2 CH3 CH4\n1 2 3 4 5 6\n"), false, "a Geosoft header is a '/' line");
  assert.equal(isReceiverTem(atlantisLog), false);
});

test("Crone: positions from the loop's corners (the line name's letter is not trusted over them), no gate times asked of the file", () => {
  const d = readTemText(crone(), "a.tem");
  assert.equal(d.n, 4); assert.match(d.source, /^Crone TEM text \(fixedloop\)$/); assert.deepEqual(d.components, ["Z"]);
  assert.deepEqual([...d.x], [460500, 460700, 460900, 461100]); assert.deepEqual([...d.y], [7554100, 7554100, 7554100, 7554100]); // the line number is inside the loop's north range
  assert.equal(d.gateTimes(d.groups[0]), null, "the times are in the channel file, which a surface survey does not always ship");
  assert.equal(d.localGrid, null);
  assert.match(d.notes.join(" "), /No coordinates in the file: stations placed along their line/);
});

test("Crone: a north-south line of the southern hemisphere, stations written as southings", () => {
  const t = crone({ line: "472400E", corners: [[472250, 7773140], [472250, 7773440], [472850, 7773440], [472850, 7773140]], stns: [-7773900, -7773875, -7773850, -7773825] });
  const d = readTemText(t, "b.tem");
  assert.deepEqual([...d.x], [472400, 472400, 472400, 472400]); assert.deepEqual([...d.y], [7773900, 7773875, 7773850, 7773825]); assert.equal(d.localGrid, null);
  assert.match(d.notes.join(" "), /No coordinates in the file: stations placed along their line/);
});

test("placing a line: the loop first, then the letter, then the size of the number; one decision for the line", () => {
  assert.equal(placeLine("7554100E", [460500, 460700], [[460400, 7554000], [460400, 7554200], [460600, 7554200], [460600, 7554000]]).axis, "x");
  const noLoop = (v, stns) => placeLine(v, stns, null);
  assert.equal(noLoop("7554100N", [460500]).axis, "x"); assert.equal(noLoop("49800E", [43600]).axis, "y"); assert.equal(noLoop("7547900", [464500]).axis, "x"); assert.equal(noLoop("49800", [43600]).axis, "y");
  assert.equal(noLoop("49800E", [43600]).how, "suffix"); assert.equal(noLoop("7547900", [464500]).how, "number");
  assert.deepEqual(placeAlongLine("7547900", 464500), { x: 464500, y: 7547900, axis: "x", how: "number" });
  assert.equal(placeLine("Hole0003", [20]), null); assert.equal(placeLine("49800E", []), null);
});

test("SMARTem V: no coordinates (the line's number and the stations), the second ADC left out, readings stacked, gate times from the windows' centres", () => {
  const d = readTemText(smartemV(), "c.tem");
  assert.equal(d.n, 3); assert.match(d.source, /^SMARTem TEM text \(inloop\)$/);
  assert.deepEqual([...d.x], [464500, 464550, 464600]); assert.deepEqual([...d.y], [7547900, 7547900, 7547900]);
  const t = d.gateTimes(d.groups[0]); assert.equal(t.length, NG); assert.ok(Math.abs(t[0] - (0.1 + 0.4) / 2) < 1e-9, `first centre ${t[0]}`);
  const mat = channelMatrix(d, d.groups[0]); assert.ok(mat.v[0] > 90000, "ADC 1 (the signal) is read, not ADC 2's flat 4,500");
  assert.ok(Math.abs(mat.v[0] - (100000 + 10) ) < 1, `the three readings of a station are stacked: ${mat.v[0]}`); // mean of +0, +10, +20
  assert.match(d.notes.join(" "), /9 second-ADC reading\(s\) left out\./);
  assert.equal(parseTemReceiver(smartemV()).stations.length, 3);
});

test("SMARTem24 export: coordinates in the file, the three components from C, a loop comment; a Fixed_Loop file is read as a ground line", () => {
  const d = readTemText(smartemExport(), "d.tem");
  assert.equal(d.n, 2); assert.deepEqual(d.components, ["Z", "X", "Y"]); assert.match(d.source, /fixed_loop/);
  assert.equal(d.x[0], 307870); assert.equal(d.x[1], 307895); assert.deepEqual(d.notes, []);
  assert.equal(d.gateTimes(d.groups[0]).length, NG);
});

test("EMBASE: the processed rows only (not the \\RAW blocks), the gate times from '\\ TIMES=', a local grid that asks for its tie", () => {
  const d = readTemText(embase(), "49800E.tem");
  assert.equal(d.n, 3); assert.match(d.source, /^EMBASE TEM text \(inl\)$/); assert.deepEqual(d.components, ["Z"]);
  assert.equal(d.gateTimes(d.groups[0]).length, NG); assert.ok(d.localGrid, "line 49800 E with stations 43,600 up: a local grid");
  assert.deepEqual([...d.x], [49800, 49800, 49800]); assert.deepEqual([...d.y], [43600, 43650, 43700]);
  assert.match(d.notes.join(" "), /Component not named: Z assumed\./);
});

test("a hole's files say they are a hole's: a downhole title or CONFIG, a collar in the header, a tool log with no decay channels", () => {
  assert.throws(() => readTemText(crone({ config: "DOWNHOLE", title: "Example Ltd - DOWNHOLE PEM SURVEY" }), "dh.tem"), /is borehole EM \(.*a header that says borehole, a downhole configuration \(CONFIG:DOWNHOLE\); decay channels CH1 … CH10, 10 gates\)/);
  assert.throws(() => readTemText(atlantisLog, "log.tem"), /is borehole EM \(a hole in the header \(XCOLLAR\)\): no reader for it yet/);
  assert.equal(boreholeHeaderRefusal("x", "a plain header"), null);
  assert.equal(boreholeHeaderRefusal("x", "LINE:1 BOREHOLE:DH1").includes("BOREHOLE"), true);
  // a ground file whose title says SURFACE is not
  assert.doesNotThrow(() => readTemText(crone(), "a.tem"));
});

test("wired: the pane shows the notes; keys in every language", () => {
  const p = read("../src/components/TemPane.jsx");
  assert.match(p, /\.\.\.\(d\.notes \|\| \[\]\)/);
  for (const k of ["a hole in the header ({v})", "No coordinates in the file: stations placed along their line.",
    "Component not named: Z assumed.", "{n} second-ADC reading(s) left out.",
    "\"{name}\" is borehole EM ({clues}): no reader for it yet."])
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
