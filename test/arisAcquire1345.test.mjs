// TASKS.csv #1345 — the acQuire-style drillhole export of ARIS 42807Z (headers as delivered), and other headers from the Sample Data
// folder: the layer each table is recognised as, and the column that becomes its value
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessTarget, guessTargetFor, guessMapping, guessColumn } from "../src/lib/layers.js";
import { epsgFromColumns } from "../src/lib/crsFromColumns.js";

const H = {
  alteration: "PROJECTCODE GEO_PROSPECT_D GEO_COLSTATUS_D HOLEID GEOLFROM GEOLTO GEO_INTERVAL_D PRIORITY ALT_RX_MIN1_TYPE ALT_RX_MIN1_INT ALT_RX_MIN1_DIST ALT_RX_MIN2_TYPE ALT_COMMENTS ALT_LOGGED_BY ALT_LOGGED_DATE GEO_COREPHOTO_D",
  breccia: "GEO_PROSPECT_D PROJECTCODE GEO_COLSTATUS_D HOLEID GEOLFROM GEOLTO GEO_INTERVAL_D PRIORITY BX_CLASS BX_COMP_CLST_PCT BX_SUPPORT_TYPE BX_CLAST BX_COMMENTS",
  geotech: "HOLEID PROJECTCODE GEOLFROM GEOLTO PRIORITY REC_REC_M REC_RQD_M REC_PCT_D RQQ_PCT_D GEO_COREPHOTO_D GEO_PROSPECT_D",
  magsus: "HOLEID PROJECTCODE GEOLFROM GEOLTO PRIORITY MAG_INSTRUMENT MAG_READING MAG_LOGGED_BY MAG_LOGGED_DATE GEO_COREPHOTO_D GEO_PROSPECT_D",
  points: "HOLEID PROJECTCODE GEOLFROM GEOLTO PRIORITY STPT_ALPHA STPT_BETA STPT_CONTACT_TYPE STPT_DEFORM_STYLE STPT_DELTA STPT_DIP_CALC STPT_DIPDIR_CALC STPT_FAULT_SENSE STPT_FEAT_INFILL STPT_FEAT_THICKNESS STPT_FEATURE STPT_FOLD_STYLE STPT_GAMMA STPT_HOLE_ORI STPT_LOGGED_BY STPT_LOGGED_DATE STPT_MEAS_TYPE STPT_MINERALIZATION STPT_VEIN_TYPE",
  sulphides: "PROJECTCODE HOLEID PRIORITY GEOLFROM GEOLTO SUL_MIN_1 SUL_MIN_1_GRAIN SUL_MIN_1_PAR SUL_MIN_1_PCT SUL_MIN_1_SPHCOL SUL_MIN_1_STYL SUL_MIN_2 SUL_COMMENTS",
  uv: "HOLEID PROJECTCODE GEOLFROM GEOLTO PRIORITY FLUOR_COLOUR FLUOR_DISTRIBUTION FLUOR_INTENSITY FLUOR_ENTERED_BY FLUOR_ENTERED_DATE",
  litho: "PROJECTCODE GEO_PROSPECT_D HOLEID GEO_COLSTATUS_D GEOLFROM GEOLTO GEO_INTERVAL_D PRIORITY LIT_ROCK_CODE LIT_ROCK_CODE_2 LIT_STRAT_CODE LIT_COMMENTS",
};
const h = (k) => H[k].split(" ");
const sheet = (k, name) => { const t = guessTargetFor(h(k), name); return { t, m: guessMapping(t, h(k)) }; };

test("alteration is coloured by the alteration, not by GEO_INTERVAL_D (the interval length)", () => {
  const { t, m } = sheet("alteration", "SVT_2024_DRILLHOLE_LOGS - ALTERATION");
  assert.equal(t, "alt");
  assert.equal(m.value, "ALT_RX_MIN1_TYPE");
});

test("the last-resort 'val' alias is a whole header, never a piece of 'interval'", () => {
  assert.equal(guessColumn(["GEO_INTERVAL_D", "CODE"], ["value", "val"]), "");
  assert.equal(guessColumn(["hole", "val"], ["value", "val"]), "val");
  assert.equal(guessColumn(["Value (ppm)"], ["value", "val"]), "Value (ppm)");
});

test("breccia by its class, geotech by RQD percent (not metres), mag sus by the reading (not the instrument)", () => {
  assert.equal(sheet("breccia", "x - BRECCIA").m.value, "BX_CLASS");
  const g = sheet("geotech", "x - GEOTECH");
  assert.equal(g.t, "geotech"); assert.equal(g.m.value, "RQQ_PCT_D");
  const mg = sheet("magsus", "x - MAGSUS");
  assert.equal(mg.t, "magsusc"); assert.equal(mg.m.value, "MAG_READING");
  assert.equal(guessTarget(h("magsus")), "magsusc");
});

test("a numeric layer never takes the instrument, the logger or the date even when nothing better is named", () => {
  const m = guessMapping("magsusc", ["HOLEID", "GEOLFROM", "GEOLTO", "MAG_INSTRUMENT", "MAG_LOGGED_BY", "MAG_LOGGED_DATE"]);
  assert.equal(m.value, "");
});

test("oriented structure points logged with GEOLFROM = GEOLTO are structure planes, with depth, alpha, beta and the feature", () => {
  const { t, m } = sheet("points", "x - STRUCTURE POINTS");
  assert.equal(t, "structure");
  assert.equal(guessTarget(h("points")), "structure");
  assert.equal(m.depth, "GEOLFROM");
  assert.equal(m.alpha, "STPT_ALPHA");
  assert.equal(m.beta, "STPT_BETA");
  assert.equal(m.value, "STPT_FEATURE");
  assert.equal(m.dip, "STPT_DIP_CALC");
  assert.equal(m.azimuth, "STPT_DIPDIR_CALC");
});

test("a sulphide log is mineralization with its percent; UV fluorescence is asked about, not forced into lithology", () => {
  const s = sheet("sulphides", "x - SULPHIDES");
  assert.equal(s.t, "mnlgy"); assert.equal(s.m.value, "SUL_MIN_1"); assert.equal(s.m.extra, "SUL_MIN_1_PCT");
  assert.equal(sheet("uv", "x - UV FLUORESCENCE").t, "custom");
  assert.equal(sheet("litho", "x - LITHOLOGY").m.value, "LIT_ROCK_CODE");
});

test("files already handled stay as they were (Woodjam / Gold Fields / Lawyers headers)", () => {
  assert.equal(guessTarget(["hole_id", "depth", "type", "width", "alpha", "beta", "gamma", "instrument"]), "structure");
  assert.equal(guessMapping("magsusc", ["project", "hole_id", "depth", "samp_class", "srm_name", "model_no", "mag_si", "note"]).value, "mag_si");
  assert.equal(guessMapping("alt", ["hole_id", "from", "to", "assemblage", "distribution"]).value, "assemblage");
  assert.equal(guessMapping("geotech", ["Hole ID", "From (m)", "To (m)", "RQD (m)", "RQD %"]).value, "RQD %");
  assert.equal(guessTarget(["hole_id", "from", "to", "min_mnlgy", "min_int_pct"]), "mnlgy");
});

test("a coordinate system named in the column headers", () => {
  assert.equal(epsgFromColumns(["HOLEID", "NAD83_9N_SUR_X", "NAD83_9N_SUR_Y", "NAD83_9N_SUR_Z"]), 26909);
  assert.equal(epsgFromColumns(["Sample Number", "UTM East\r\nNAD83_U10", "UTM North\r\nNAD83_U10"]), 26910);
  assert.equal(epsgFromColumns(["x_wgs84_utm_18s", "y_wgs84_utm_18s"]), 32718);
  assert.equal(epsgFromColumns(["NAD27 Zone 11N East"]), 26711);
  assert.equal(epsgFromColumns(["EASTING", "NORTHING", "ELEVATION"]), null);
  assert.equal(epsgFromColumns(["NAD83_9N_X", "NAD83_10N_X"]), null, "two zones named: no guess");
  assert.equal(epsgFromColumns(["NAD83_CSRS_9N_X"]), null, "a CSRS realisation is not guessed");
  assert.equal(epsgFromColumns(["WGS84_X", "WGS84_Y"]), null, "WGS 84 with no zone is not a UTM");
});
