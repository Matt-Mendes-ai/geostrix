// TASKS.csv #4070 (side 2) — small SYNTHETIC geophysics files for the panes that had no sample to measure: TEM lines, MT soundings, FDEM soundings.
// Entirely made up (formulae below, no survey behind them), placed over the WA lode gold sample's area (GDA94 / MGA zone 51) so they land in that project.
// Regenerate: node test/fixtures/geophys4070/make.mjs  (deterministic; test/geophysFixtures4070.test.mjs reads the files it writes)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(dir, { recursive: true });
const MU0 = 4e-7 * Math.PI;

// --- TEM lines: Aarhus Workbench layout, 3 east-west lines of 41 stations 50 m apart, 16 gates 0.01-3 ms; V = C exp(-t / tau), tau 0.3 ms in the
// background and 1.6 ms over a made-up conductor near (458000, 6563800)
const T = Array.from({ length: 16 }, (_, k) => 0.01 * 300 ** (k / 15));
export function temWorkbench() {
  const tauAt = (x, y) => 0.3 + 1.3 * Math.exp(-((x - 458000) ** 2 + (y - 6563800) ** 2) / (2 * 250 ** 2));
  const cols = ["LINE_NO", "UTMX", "UTMY", "TOPO", ...T.map((_, k) => `DBDT_CH1GT${k + 1}`), ...T.map((_, k) => `DBDT_STD_CH1GT${k + 1}`)];
  const out = ["/INFO", "/ SYNTHETIC export, Aarhus Workbench layout (made up for GeoStrix's tests, not a survey)", "/DUMMY", "/9999", "/COORDINATE SYSTEM", "/ GDA94 / MGA zone 51, epsg:28351",
    "/GATE TIMES CHANNEL 1", "/ " + T.map((t) => (t / 1000).toExponential(4)).join(" "), "/ " + cols.join(" ")];
  for (let l = 0; l < 3; l++) for (let i = 0; i <= 40; i++) {
    const x = 457000 + i * 50, y = 6563600 + l * 200, tau = tauAt(x, y);
    const v = T.map((t) => 1e3 * Math.exp(-t / tau));
    out.push([1000 + 10 * l, x, y, 312, ...v.map((a) => a.toExponential(5)), ...v.map(() => "0.03")].join(" "));
  }
  return out.join("\n") + "\n";
}

// --- MT: 5 EDI soundings 0.005 degrees apart along an east-west line; a 2-layer earth (300 ohm.m over 10 ohm.m from 400 m) as apparent resistivity
// by a smooth blend over the skin depth, phase 45 degrees plus a bump where the conductor shows; impedance from rho and phase (SI units)
const FREQS = Array.from({ length: 16 }, (_, k) => 10000 / 10 ** (k / 3)); // 10 kHz .. 0.01 Hz, 3 per decade (descending, as files list them)
export function mtEdi(k) {
  const lat = -31.07, lon = 122.545 + 0.005 * k, top = 400 + 60 * k; // the conductor deepens to the east
  const rhoA = (f) => { const skin = 503 * Math.sqrt(300 / f), w = 1 / (1 + Math.exp(-(skin - top) / (0.4 * top))); return 300 * (1 - w) + 10 * w; };
  const phs = (f) => { const skin = 503 * Math.sqrt(300 / f); return 45 + 15 * Math.exp(-(((skin - top) / top) ** 2)); };
  const dms = (d) => { const s = d < 0 ? "-" : "", a = Math.abs(d), D = Math.floor(a), M = Math.floor((a - D) * 60), S = ((a - D) * 60 - M) * 60; return `${s}${D}:${String(M).padStart(2, "0")}:${S.toFixed(2).padStart(5, "0")}`; };
  const z = (f) => { const mag = Math.sqrt(rhoA(f) * 2 * Math.PI * f * MU0), p = (phs(f) * Math.PI) / 180; return { re: mag * Math.cos(p), im: mag * Math.sin(p) }; };
  const block = (name, vals) => `>${name} //${vals.length}\n${vals.map((v) => v.toExponential(6)).join(" ")}\n`;
  const id = `SYN${String(k + 1).padStart(2, "0")}`;
  return [
    `>HEAD\nDATAID="${id}"\nPROSPECT="SYNTHETIC"\nLAT=${dms(lat)}\nLONG=${dms(lon)}\nELEV=312\nEMPTY=1.0E+32\n`,
    ">INFO\nSynthetic sounding made for GeoStrix's tests: not a survey.\n",
    `>=DEFINEMEAS\nREFLAT=${dms(lat)}\nREFLONG=${dms(lon)}\n`,
    `>=MTSECT\nNFREQ=${FREQS.length}\n`,
    `>FREQ ORDER=DEC //${FREQS.length}\n${FREQS.map((f) => f.toExponential(6)).join(" ")}\n`,
    block("ZXYR", FREQS.map((f) => z(f).re)), block("ZXYI", FREQS.map((f) => z(f).im)),
    block("ZYXR", FREQS.map((f) => -z(f).re)), block("ZYXI", FREQS.map((f) => -z(f).im)),
    block("ZXXR", FREQS.map(() => 0)), block("ZXXI", FREQS.map(() => 0)), block("ZYYR", FREQS.map(() => 0)), block("ZYYI", FREQS.map(() => 0)),
    block("RHOXY", FREQS.map(rhoA)), block("PHSXY", FREQS.map(phs)),
    ">END\n",
  ].join("");
}

// --- FDEM: a DUALEM-421 style CSV, 80 readings 10 m apart along a north-south walk; apparent conductivity rises over a made-up clay lens
export function fdemDualem() {
  const head = "LATd,LONd,ALTm,H1mS_m,P1mS_m,H2mS_m,P2mS_m,H4mS_m,P4mS_m,X,Y,dem_elevation_m";
  const rows = [head];
  for (let i = 0; i < 80; i++) {
    const x = 458200, y = 6563400 + 10 * i, clay = Math.exp(-(((y - 6563800) / 120) ** 2));
    const lat = -31.0745 + (10 * i) / 111000, lon = 122.5575;
    const s = (deep, base) => (base + (deep ? 25 : 12) * clay).toFixed(2);
    rows.push([lat.toFixed(6), lon.toFixed(6), 312.4, s(false, 4), s(false, 3), s(true, 6), s(true, 5), s(true, 9), s(true, 7), x.toFixed(1), y.toFixed(1), 312].join(","));
  }
  return rows.join("\n") + "\n";
}

// --- borehole EM: a Maxwell table (CRLF, as the files are) for a made-up hole DH-SYN-01, stations every 10 m from 10 to 300 m, components A, U and V,
// 10 gates; a made-up conductor at 180 m: the axial (A) component crosses zero there, the cross components peak beside it, all decaying with time
const DH_T = [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2];
export function dhemMaxwell() {
  const out = ["TEM File Created by MAXWELL (SYNTHETIC: made up for GeoStrix's tests, not a survey)",
    "LINE:DH-SYN-01 INSTRUMENT:SYNTHETIC DATATYPE:TEM CONFIG:DOWNHOLE UNITS:(nT/s) BFREQ:5.0 CURRENT:20.0 XCOLLAR:458150.0 YCOLLAR:6563750.0 ZCOLLAR:312.0 &",
    "LOOP:#1 &", "LV1X:457800.00 LV1Y:6563400.00 LV1Z:312.00 &", "LV2X:458500.00 LV2Y:6563400.00 LV2Z:312.00 &", "LV3X:458500.00 LV3Y:6564100.00 LV3Z:312.00 &", "LV4X:457800.00 LV4Y:6564100.00 LV4Z:312.00",
    `/TIMES(ms)=${DH_T.join(",")}`, `/TIMESWIDTH(ms)=${DH_T.map((t) => +(t / 2).toFixed(3)).join(",")}`,
    "      EAST        NORTH        LEVEL         ELEV      STATION    COMPONENT         GAIN" + DH_T.map((_, k) => `             CH${k + 1}`).join("")];
  for (let s = 10; s <= 300; s += 10) {
    const z = 312 - s, d = (s - 180) / 25, bump = Math.exp(-d * d);
    const comp = { A: (t) => (2000 * Math.exp(-t / 3) * (1 - 0.002 * s) - 900 * d * bump * Math.exp(-t / 12)), U: (t) => 400 * bump * Math.exp(-t / 10) - 20, V: (t) => -250 * bump * Math.exp(-t / 10) + 10 };
    for (const c of ["A", "U", "V"]) out.push(`  458150.0  6563750.0  ${z.toFixed(1)}  ${z.toFixed(1)}  ${s.toFixed(1)}  ${c}  1.0  ${DH_T.map((t) => comp[c](t).toFixed(3)).join("  ")}`);
  }
  return out.join("\r\n") + "\r\n";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(path.join(dir, "dhem_maxwell_SYNTHETIC.tem"), dhemMaxwell());
  writeFileSync(path.join(dir, "tem_lines_SYNTHETIC.xyz"), temWorkbench());
  for (let k = 0; k < 5; k++) writeFileSync(path.join(dir, `mt_SYNTHETIC_${k + 1}.edi`), mtEdi(k));
  writeFileSync(path.join(dir, "fdem_dualem_SYNTHETIC.csv"), fdemDualem());
  console.log("written to", dir);
}
