// TASKS.csv #3100 — the BC samples downloaded on request: the zip reader, where a sample is, the conversions into a complete folder (or
// none), Harry's real tables from a drillhole database, and the wiring (the download's hosts, the renderer's fallback and dialog)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ss = require("../electron/sampleSources.js");
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// a .zip with one stored and the rest deflated entries
function makeZip(files) {
  const locals = [], central = [];
  let off = 0;
  Object.entries(files).forEach(([name, text], i) => {
    const data = Buffer.from(text), method = i === 0 ? 0 : 8, comp = method ? zlib.deflateRawSync(data) : data, nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, comp); central.push(ch, nb); off += 30 + nb.length + comp.length;
  });
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("the zip reader: stored and deflated entries, by name; a missing one is said", () => {
  const z = ss.readZip(makeZip({ "a.txt": "stored", "Mapping/b.TAB": "deflated ".repeat(50) }));
  assert.deepEqual(z.names, ["a.txt", "Mapping/b.TAB"]);
  assert.equal(z.read("a.txt").toString(), "stored");
  assert.equal(z.read("Mapping/b.TAB").toString(), "deflated ".repeat(50));
  assert.throws(() => z.read("nope.csv"), /not in the downloaded package/);
  assert.throws(() => ss.readZip(Buffer.from("not a zip at all, really not")), /Not a \.zip/);
});

test("Perk-Rocky: the six MapInfo layers copied as delivered into a folder that appears complete, with where they came from", () => {
  const files = {}; for (const b of ss.PERK_LAYERS) for (const e of ["TAB", "MAP", "ID", "DAT"]) files[`Mapping/${b}.${e}`] = `${b}.${e} bytes`;
  files["PR_Total_Rocks_Nov_08_2024.xlsx"] = "not used";
  const root = mkdtempSync(path.join(tmpdir(), "gx3100-"));
  try {
    const r = ss.convertDownload("perk", makeZip(files), root, path.join(root, "_tmp"), { now: new Date("2026-11-12T00:00:00Z") });
    assert.equal(r.files.length, 24);
    const out = path.join(root, "perk_rocky");
    assert.equal(readFileSync(path.join(out, "PR-Str_interp.TAB"), "utf8"), "PR-Str_interp.TAB bytes");
    assert.deepEqual(JSON.parse(readFileSync(path.join(out, "_source.json"), "utf8")), { sample: "perk", report: "42317", url: "https://apps.nrs.gov.bc.ca/pub/aris/Report/42317Z.zip/", downloaded: "2026-11-12T00:00:00.000Z", files: r.files });
    assert.ok(!existsSync(`${out}.part`), "the work folder is renamed, not left");
    assert.equal(ss.sampleState("perk_rocky", null, root), "downloaded");
    // a broken package: no folder appears, and the earlier copy is kept
    delete files["Mapping/PR-Str_interp.DAT"];
    assert.throws(() => ss.convertDownload("perk", makeZip(files), root, path.join(root, "_tmp")), /PR-Str_interp\.DAT/);
    assert.equal(ss.sampleState("perk_rocky", null, root), "downloaded");
    assert.equal(readFileSync(path.join(out, "PR-Str_interp.DAT"), "utf8"), "PR-Str_interp.DAT bytes");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("where a sample is: bundled (its marker file), downloaded (its _source.json), else missing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gx3100-")), b = path.join(root, "b"), u = path.join(root, "u");
  try {
    mkdirSync(path.join(b, "silvertip"), { recursive: true }); writeFileSync(path.join(b, "silvertip", "collars.csv"), "x");
    mkdirSync(path.join(u, "harry_property"), { recursive: true }); writeFileSync(path.join(u, "harry_property", "collars.csv"), "x");
    assert.equal(ss.sampleState("silvertip", b, u), "bundled");
    assert.equal(ss.sampleState("harry_property", b, u), "missing", "files without _source.json: a conversion that did not finish");
    writeFileSync(path.join(u, "harry_property", "_source.json"), "{}");
    assert.equal(ss.sampleState("harry_property", b, u), "downloaded");
    assert.equal(ss.sampleState("woodjam", b, u), "missing");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Silvertip: the acQuire tables to tidy CSVs (a tiny made-up report in the real layout)", () => {
  const H = "Appendix H - Drill Hole Data and Analytical Results", L = `${H}/GEOLOGY LOGS`;
  const tsv = (head, rows) => [head.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
  const iv = (extra, vals) => tsv(["HOLEID", "GEOLFROM", "GEOLTO", ...extra], [["H1", "0", "10", ...vals]]);
  const files = {
    [`${H}/SVT_2024_DRILLHOLE_COLLAR.csv`]: "HOLEID,NAD83_9N_SUR_X,NAD83_9N_SUR_Y,NAD83_9N_SUR_Z,EOH (M)\nH1,1,2,3,100\n",
    [`${H}/SVT_2024_DRILLHOLE_SURVEYS.csv`]: "SURVTYPE,HOLEID,DEPTH (M),AZIMUTH,DIP\nPLAN,H1,0,90,-60\nTRUSURVEY,H1,10,91,-59\nPLAN,H2,0,10,-45\n",
    [`${L}/SVT_2024_GEO_LITHOLOGY.txt`]: iv(["LIT_ROCK_CODE", "LIT_COMMENTS"], ["LST", "grey"]),
    [`${L}/SVT_2024_GEO_ALTERATION.txt`]: iv(["ALT_RX_MIN1_TYPE"], ["SER"]),
    [`${L}/SVT_2024_GEO_BRECCIA.txt`]: iv(["BX_CLASS"], ["HYD"]),
    [`${L}/SVT_2024_GEO_VEIN.txt`]: iv(["VEI_1_TYPE"], ["QTZ"]),
    [`${L}/SVT_2024_GEO_SULPHIDES.txt`]: iv(["SUL_MIN_1", "SUL_MIN_1_PCT", "SUL_MIN_2", "SUL_MIN_2_PCT"], ["PY", "2", "SP", "0.5"]),
    [`${L}/SVT_2024_GEO_STRUCT_INTERVALS.txt`]: iv(["STIN_TYPE", "STIN_INTENSITY", "STIN_DESCRIPTION"], ["FLT", "3", "gouge"]),
    [`${L}/SVT_2024_GEO_GEOTECH.txt`]: iv(["RQQ_PCT_D", "REC_PCT_D"], ["80", "95"]),
    [`${L}/SVT_2024_GEO_MAG_SUSC.txt`]: tsv(["HOLEID", "GEOLFROM", "MAG_READING"], [["H1", "5", "0.3"]]),
    [`${L}/SVT_2024_GEO_STRUCT_POINTS.txt`]: tsv(["HOLEID", "GEOLFROM", "STPT_FEATURE", "STPT_ALPHA", "STPT_BETA"], [["H1", "5", "VN", "40", "120"]]),
    [`${H}/SVT_2024_SAMPLES_DRILLING_ASSAYS.csv`]: "HOLEID,SAMPFROM,SAMPTO,SAMPLEID,Zn_ppm_BESTEL,Ag_ppm_BESTEL,ZnO_pct\nH1,0,2,S1,1200,-0.5,9\n",
    "Appendix G - Rock Sample Locations and Analytical Results/SVT_2024_SAMPLES_SURFACE_ROCKS_UPDATED.csv": "SAMPLEID,NAD83_9N_BEST_X,NAD83_9N_BEST_Y,NAD83_9N_BEST_Z,Pb_ppm_BESTEL\nR1,1,2,3,44\n",
    [`${H}/SVT_2024_SAMPLES_SURFACE_SOILS.txt`]: tsv(["SAMPLEID", "NAD83_9N_BEST_X", "NAD83_9N_BEST_Y", "NAD83_9N_BEST_Z", "Cu_ppm_BESTEL"], [["SO1", "1", "2", "3", "12"]]),
    "Appendix E - Stream Seds Sample Locations and Analytical Results/SVT_2024_SAMPLES_SURFACE_STREAMS.csv": "SAMPLEID,NAD83_9N_BEST_X,NAD83_9N_BEST_Y,NAD83_9N_BEST_Z,Au_ppm_BESTEL\nST1,1,2,,0.01\n",
  };
  const root = mkdtempSync(path.join(tmpdir(), "gx3100-"));
  try {
    const r = ss.convertDownload("silvertip", makeZip(files), root, path.join(root, "_tmp"));
    assert.equal(r.files.length, 16);
    const rd = (f) => readFileSync(path.join(root, "silvertip", f), "utf8");
    assert.equal(rd("collars.csv"), "hole_id,x,y,z,length\nH1,1,2,3,100\n");
    assert.equal(rd("survey.csv"), "hole_id,depth,azimuth,dip\nH1,10,91,-59\nH2,0,10,-45\n", "TRUSURVEY kept, PLAN only where a hole has nothing else");
    assert.equal(rd("mnlgy.csv"), "hole_id,from,to,mineral,percent\nH1,0,10,PY,2\nH1,0,10,SP,0.5\n");
    assert.equal(rd("assays.csv"), "hole_id,from,to,sample_id,Zn_ppm,Ag_ppm\nH1,0,2,S1,1200,-0.5\n", "the BESTEL elements only, as delivered");
    assert.equal(rd("streams.csv"), "sample_id,x,y,z,medium,Au_ppm\nST1,1,2,,stream sediment,0.01\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

let sqlite = null; try { sqlite = require("node:sqlite"); } catch { /* Node < 22.5 */ }
test("Harry: report 37584's collars, lithology and assays from the drillhole database (ore-grade assays first, '<' and '>' left blank)", { skip: !sqlite && "node:sqlite needs Node 22.5+" }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "gx3100-")), db = path.join(root, "ardh.gpkg");
  try {
    const d = new sqlite.DatabaseSync(db);
    d.exec(`CREATE TABLE collar (hole_id INTEGER, hole_name TEXT, easting REAL, northing REAL, elevation REAL, azimuth REAL, dip REAL, length REAL, ar_number TEXT);
      CREATE TABLE litho (hole_id INTEGER, from_depth REAL, to_depth REAL, litho_unit TEXT);
      CREATE TABLE sample (fid INTEGER, sample_id INTEGER, hole_id INTEGER, from_depth REAL, to_depth REAL);
      CREATE TABLE code_analytes (analyte_code INTEGER, analyte_abbr TEXT);
      CREATE TABLE determin (sample_id INTEGER, analyte_code INTEGER, method_code INTEGER, abundance TEXT);
      INSERT INTO collar VALUES (2, '17HR-269', 463215.33, 6178558.2, 1077.8, 200, -65, 632, '37584'), (1, '17HR-268', 463375.03, 6177691.17, 1160.9, 210, -45, 184, '37584'), (3, 'OTHER-1', 1, 2, 3, 0, -90, 10, '99999');
      INSERT INTO litho VALUES (1, 7.76, 11.2, 'DACT'), (1, 0, 7.76, 'CAS'), (3, 0, 5, 'X');
      INSERT INTO sample VALUES (20, 200, 1, 9, 11), (10, 100, 1, 7.76, 9), (30, 300, 2, 1.9, 3), (40, 400, 3, 0, 1);
      INSERT INTO code_analytes VALUES (54, 'Au'), (75, 'Cu'), (111, 'Zn'), (9, 'S');
      INSERT INTO determin VALUES (100, 54, 30, '0.018'), (100, 54, 169, NULL), (100, 75, 142, '261'), (100, 111, 142, '>10000'), (100, 111, 176, '1.340'),
        (200, 54, 30, '7.64'), (200, 54, 169, '7.65'), (200, 9, 142, '>10.0'), (300, 54, 30, '<0.005'), (300, 75, 142, '28.7'), (400, 54, 30, '1');`);
    d.close();
    const out = {}; const files = ss.convertHarry(db, (n, b) => { out[n] = b.toString(); });
    assert.deepEqual(files, ["collars.csv", "litho.csv", "assay_wide.csv"]);
    assert.equal(out["collars.csv"], "hole_id,x,y,z,azimuth,dip,length\n17HR-268,463375.03,6177691.17,1160.9,210.0,-45.0,184.0\n17HR-269,463215.33,6178558.2,1077.8,200.0,-65.0,632.0\n");
    assert.equal(out["litho.csv"], "hole_id,from,to,lithology\n17HR-268,0.0,7.76,CAS\n17HR-268,7.76,11.2,DACT\n");
    const a = out["assay_wide.csv"].split("\n");
    assert.equal(a[0], "hole_id,from,to,Au_ppm,Ag_ppm,Cu_ppm,Pb_ppm,Zn_ppm,As_ppm,Al_pct,Fe_pct,Mg_pct,Ca_pct,Na_pct,K_pct,Ti_pct,S_pct");
    assert.equal(a[1], "17HR-268,7.76,9.0,0.018,,261.0,,13400.0,,,,,,,,,", "the database order (fid); Zn's >10000 by its ore-grade assay");
    assert.equal(a[2], "17HR-268,9.0,11.0,7.65,,,,,,,,,,,,,", "Au-GRA21 where it has a number; S >10.0 blank");
    assert.equal(a[3], "17HR-269,1.9,3.0,,,28.7,,,,,,,,,,,", "'<0.005' blank");
    assert.equal(a.length, 5);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("wiring: the Province's two servers only, every hop; the menu and cards; the renderer's fallback, its event and the dialog", () => {
  assert.deepEqual([...ss.SAMPLE_HOSTS].sort(), ["apps.nrs.gov.bc.ca", "cmscontent.nrs.gov.bc.ca"]);
  for (const s of Object.values(ss.SAMPLE_DOWNLOADS)) assert.ok(ss.SAMPLE_HOSTS.has(new URL(s.url).hostname), s.url);
  assert.equal(ss.SAMPLE_DOWNLOADS.woodjam, undefined, "Woodjam (1.94 GB) is not offered");
  const m = src("electron/main.js");
  assert.match(m, /allowHost: \(h\) => h\.protocol === "https:" && sampleSources\.SAMPLE_HOSTS\.has\(h\.hostname\)/);
  assert.match(m, /\.\.\.\(st\.woodjam === "missing" \? \[\] : \[\{ label: L\("Woodjam/);
  assert.match(m, /new Worker\(path\.join\(__dirname, "sampleWorker\.js"\)/);
  assert.match(m, /const forced = !app\.isPackaged && process\.env\.GEOSTRIX_SAMPLE_DATA_DIR;/);
  const d = src("src/lib/desktop.js");
  assert.match(d, /const roots = \[res\.ok \? res\.path : null, res\.userPath\]\.filter\(Boolean\);/);
  assert.match(d, /window\.dispatchEvent\(new CustomEvent\("geostrix-sample-missing", \{ detail: \{ id \} \}\)\)/);
  const app = src("src/App.jsx");
  assert.match(app, /if \(BC_SAMPLE_INFO\[which\] && \(await sampleStatus\(\)\)\[which\] === "missing"\) \{ setSampleAsk\(which\); return; \}/);
  assert.match(app, /window\.addEventListener\("geostrix-sample-missing", h\)/);
  assert.match(src("src/modules/viewer/importPipelineImpl.js"), /loadSampleFiles\(S\.dir, S\.files, \{ optional: S\.optional \|\| \[\] \}\)/);
  assert.match(src("scripts/smoke-electron.mjs"), /"wa_uranium" \+ sep \+ "collars\.csv"/);
  const notice = src("build/installer-notice.txt");
  assert.match(notice, /CC BY 4\.0/); assert.match(notice, /Copernicus WorldDEM-30/); assert.match(notice, /NOT INCLUDED: the sample projects from BC's public assessment reports/);
  assert.match(src("PRIVACY.md"), /`apps\.nrs\.gov\.bc\.ca`, `cmscontent\.nrs\.gov\.bc\.ca`/);
  for (const f of ["website/privacy.html", "website/es/privacy.html", "website/pt-br/privacy.html", "website/fr/privacy.html", "website/ar/privacy.html"]) assert.match(src(f), /<code>apps\.nrs\.gov\.bc\.ca<\/code>, <code>cmscontent\.nrs\.gov\.bc\.ca<\/code>/, f);
  // the build scripts write through the same converters
  assert.match(src("scripts/samples/build-silvertip.mjs"), /convertSilvertip\(/); assert.match(src("scripts/samples/build-harry.mjs"), /convertHarry\(gpkg/); assert.match(src("scripts/samples/build-perk-rocky.mjs"), /convertPerk\(/);
});

test("the cards and the dialog give the same size; Woodjam has no card where it is missing, the others say they download", async () => {
  const { BC_SAMPLE_INFO } = await import("../src/lib/bcSamples.js");
  for (const [id, info] of Object.entries(BC_SAMPLE_INFO)) { assert.equal(info.bytes, ss.SAMPLE_DOWNLOADS[id].bytes, id); assert.equal(info.report, ss.SAMPLE_DOWNLOADS[id].report, id); assert.equal(info.host, new URL(ss.SAMPLE_DOWNLOADS[id].url).hostname, id); }
  const c = src("src/lib/sampleCards.js");
  assert.match(c, /size: Math\.round\(info\.bytes \/ 1048576\)/);
  assert.match(c, /return ordered\.filter\(\(c\) => !\(c\.id === "woodjam" && missing\("woodjam"\)\)\);/);
});
