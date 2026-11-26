// TASKS.csv #1120 / #1346 — the bundled samples offered on the empty 3D View (moved out of ViewerModule.jsx, which has a size cap,
// #1084). The one that suits the tab comes first: the empty card's filled button.
import { t as tr } from "./i18n.js";
import { sampleStatusAtStart, sampleStatus } from "./desktop.js"; // TASKS.csv #3100; sampleStatus: #3133
import { BC_SAMPLE_INFO } from "./bcSamples.js"; // TASKS.csv #3100
import { MACPASS_CREDIT } from "./sampleCredits.js"; // TASKS.csv #3496

// TASKS.csv #3100 — the BC samples are not shipped (BC's terms): each is "bundled" (a dev run), "downloaded" or "missing" ({} in a browser
// preview, where every sample is served). Read once at start; a download marks its sample here (App.jsx).
let status = null;
const statusNow = () => status || (status = sampleStatusAtStart());
export function markSampleDownloaded(id) { statusNow()[id] = "downloaded"; }
const missing = (id) => statusNow()[id] === "missing";

// TASKS.csv #3133 — a BC sample not on this computer, chosen on the empty 3D View's card: the download dialog first (App.jsx answers the
// 'geostrix-sample-missing' event and loads the sample once it is downloaded), before the tab is renamed or anything is read; it used to rename
// the tab and show an error notice behind the dialog. -> true when it asked (the caller stops there). The status is read now, not at start.
export async function askSampleDownload(which, statusOf = sampleStatus, dispatch = (id) => window.dispatchEvent(new CustomEvent("geostrix-sample-missing", { detail: { id } }))) {
  if (!BC_SAMPLE_INFO[which]) return false;
  let st = {};
  try { st = (await statusOf()) || {}; } catch { st = {}; }
  if (st[which] !== "missing") return false;
  dispatch(which);
  return true;
}

// TASKS.csv #3192 (Matt, 2026-11-13: "rank it from the most useful to least") — the empty 3D View's order. Most useful first: the most of
// GeoStrix one project exercises (drillholes with logs and assays, then surface geochemistry, geophysics, structures, terrain), real data
// throughout, light enough for a modest computer, and opened without a download. The first is the empty card's filled button.
//   wa_gold        66 inclined holes: lithology, alteration, veins, oriented structures and 14,664 gold assays — the whole drill workflow
//   yk_macpass     559 holes with surveys, 32,546 Ag-Pb-Zn assays and bulk density (Fireweed Metals, with permission) — #3496, ranked second by Matt
//   qld_century    37 holes with surveys, logs and assays, 730 soils and a magnetic grid: drilling, Geochem and Geophysics in one
//   wa_iron        147 holes with logs, assays, downhole density / gamma / susceptibility and a magnetic grid (a bulk commodity)
//   wa_zinc_copper 32 holes with alteration and sulphide logs, plus soils and stream sediments
//   silvertip      9 deep holes with real logs, oriented core and assays, rock / soil / stream samples — rich, but a BC download
//   harry          37 holes with assays (some interval layers synthesized) — a BC download
//   woodjam        19 holes, IP and ZTEM — only where a copy exists (never downloaded)
//   qc_rouyn_noranda  geology, 299 structures and 280 hole traces on a terrain (no logs or assays)
//   wa_lead_zinc   99 holes with assays and SG, plain logs
//   wa_uranium     430 shallow holes and a gamma log: a specialised flat covered deposit, and heavier
//   mount_raymond  mapping only (Model from map)
//   perk           mapping only, a BC download
//   fi_lapland     rock geochemistry and a 1:1M map, no holes
//   blake          gravity only, no holes
//   osborne        airborne magnetics only (a point survey and a grid), no holes: #2006
//   geomet         118 holes reconstructed from sample positions, local grid, no CRS: #2006
export const SAMPLE_RANK = ["wa_gold", "yk_macpass", "qld_century", "wa_iron", "wa_zinc_copper", "silvertip", "harry", "woodjam", "qc_rouyn_noranda", "wa_lead_zinc", "wa_uranium", "mount_raymond", "perk", "fi_lapland", "blake", "osborne", "geomet"];
// Surface Geology: the mapping samples first, best first (bundled with a terrain and structures, then the downloads)
export const SURFACE_LEAD = ["qc_rouyn_noranda", "mount_raymond", "perk", "silvertip"];
// TASKS.csv #3948 (Matt, 2026-11-21: "fold the samples ... Show Macpass and Mount Raymond"), then #4094 (2026-11-25: "the list"): the 3D View's first pick is Macpass
// (Surface Geology leads with its mapping samples, SURFACE_LEAD): it is the row selected when the table opens. Every sample is a row of the table (sampleListFor).
export const SAMPLES_IN_VIEW = ["yk_macpass", "mount_raymond"];
export function sampleCardsFor(mode) {
  const cards = [
    { id: "harry", title: tr("Load the bundled Harry property sample project — 37 real drillholes from BC's public ARIS database, with synthesized interval layers") },
    { id: "woodjam", title: tr("Load the bundled Woodjam sample project — 19 diamond drillholes (2023) with real logs, surveys, oriented structures and assays, six IP lines and the ZTEM 3D inversion, from BC's public assessment report 41597") },
    { id: "perk", title: tr("Load the bundled Perk-Rocky sample — 2024 surface mapping (geological map, structure lines and 147 outcrop measurements as MapInfo files, on a Copernicus terrain), no drillholes: try 3D Modelling > Model from map") },
  ];
  cards.push({ id: "silvertip", title: tr("Load the bundled Silvertip sample project — 9 deep diamond drillholes (2024) with real logs, surveys, oriented structures and assays, and 606 rock, soil and stream-sediment samples, from BC's public assessment report 42807") }); // TASKS.csv #1346
  // TASKS.csv #2168 — a fifth sample from another jurisdiction and deposit style: shallow aircore through a lignite-bearing palaeochannel, graded by gamma log (#2324: first labelled calcrete, wrongly)
  cards.push({ id: "wa_uranium", title: tr("Load the bundled Western Australian palaeochannel-uranium sample — 430 aircore and diamond drillholes (2009-2010) with their lithology and alteration logs, multi-element assays and a downhole gamma / eU3O8 log, from the State's open-file WAMEX drillhole database (report A87304)") });
  // TASKS.csv #2829 — a sixth sample, the first with no drillholes and no mapping: public gravity (a published grid and its stations)
  cards.push({ id: "blake", title: tr("Load the bundled Blake River gravity sample — the Geological Survey of Canada's Bouguer anomaly grid of the Blake River area (Abitibi, Quebec) and its 7,810 gravity stations, no drillholes: try Maps for the grid and Geophysics > Point survey for the stations") });
  // TASKS.csv #2006 — an airborne magnetic survey and grid (Geoscience Australia P1029, via Fatiando a Terra Data, CC BY 4.0), and a research dataset's drillhole samples (GeoMet, CC BY 4.0)
  cards.push({ id: "osborne", title: tr("Load the bundled Osborne magnetics sample — Geoscience Australia's airborne magnetic survey P1029 over the Osborne mine area (Mt Isa Inlier, Queensland), as processed by Leonardo Uieda: 24,927 flight-line readings and the 50 m Lightning Creek anomaly grid, no drillholes: try Geophysics > Point survey and Maps") });
  cards.push({ id: "geomet", title: tr("Load the bundled GeoMet sample — 118 inclined drillholes with 1,999 assays of 18 elements from a published research dataset (IMPA, UFMG, Vale S.A.). The source has no collars or surveys: the traces are rebuilt from the sample positions, on a local grid with no coordinate system") });
  cards.push({ id: "mount_raymond", title: tr("Load the bundled Mount Raymond sample — a Geological Survey of Canada 1:50 000 bedrock map of the northern Yukon (map units, faults, folds and 119 planar measurements, on a Canadian Digital Elevation Model terrain), no drillholes: try 3D Modelling > Model from map") }); // TASKS.csv #3107
  cards.push({ id: "wa_iron", title: tr("Load the bundled Western Australian bedded-iron sample — 147 reverse-circulation and diamond drillholes (2018) on one block of a flat-lying iron deposit under cover, with strand logs, XRF assays, downhole density, gamma and magnetic-susceptibility logs and the national magnetic grid, from the State's open-file WAMEX drillhole database (report A119232) and Geoscience Australia") }); // TASKS.csv #3107
  cards.push({ id: "wa_lead_zinc", title: tr("Load the bundled Western Australian lead-silver-zinc sample — 99 reverse-circulation and diamond drillholes (2010) on a shallow carbonate-hosted deposit in the east Kimberley, with lithology and weathering logs, assays and specific gravity, from the State's open-file WAMEX drillhole database (report A91581)") }); // TASKS.csv #3107
  cards.push({ id: "wa_zinc_copper", title: tr("Load the bundled Western Australian zinc-copper sample — 32 reverse-circulation drillholes (2007) on sulphide prospects in felsic volcanic rocks of the east Pilbara, with lithology, alteration and sulphide logs and assays, and 157 soil and 46 stream-sediment samples, from the State's open-file WAMEX database (report A77713). The company's collar RLs (stated as AHD) sit about 15-25 m below the public terrain; the source does not say why.") }); // TASKS.csv #3107; the height note: #3884
  cards.push({ id: "wa_gold", title: tr("Load the bundled Western Australian lode-gold sample — 66 inclined reverse-circulation and diamond drillholes (2018-2019) on a gold prospect east of Kalgoorlie, with lithology, alteration, veining and oriented-structure logs and 14,664 gold assays, from the State's open-file WAMEX drillhole database (report A122506)") }); // TASKS.csv #3107
  // TASKS.csv #3496 — Fireweed Metals Corp.'s Macpass drilling, used with their permission: the credit they chose follows the card's text, untranslated
  cards.push({ id: "yk_macpass", title: tr("Load the bundled Macpass sample — Fireweed Metals Corp.'s drilling of the Macpass project in east Yukon (1952-2023): 559 holes with down-hole surveys, 32,546 sampled intervals (Ag, Pb, Zn) and 32,498 bulk densities, nothing synthesized.") + " " + MACPASS_CREDIT });
  cards.push({ id: "fi_lapland", title: tr("Load the bundled Central Lapland sample — the Geological Survey of Finland's 1:1 000 000 bedrock units and faults over a 100 km window of the greenstone belt, and 121 whole-rock samples with their major oxides and trace elements, no drillholes: try Geochem for the rock diagrams") }); // TASKS.csv #3107
  cards.push({ id: "qc_rouyn_noranda", title: tr("Load the bundled Rouyn-Noranda sample — a 7 km block of the Abitibi from Quebec's SIGEOM: regional geology, 299 outcrop structural measurements and 280 historical diamond drillhole traces (collar, direction and depth, no logs or assays) on a Canadian Digital Elevation Model terrain, inside the Blake River gravity sample") }); // TASKS.csv #3107
  cards.push({ id: "qld_century", title: tr("Load the bundled Century sample — the 1992 drilling of a shale-hosted zinc-lead-silver deposit in north-west Queensland, from the Geological Survey of Queensland's open drillhole and geochemistry database: 37 holes with surveys, lithology and assays, 730 soil samples, and Geoscience Australia's magnetic grid over them") }); // TASKS.csv #3107
  // #3100 — a BC sample not on this computer says it downloads first (its title: from where, how big); Woodjam is not offered then
  for (const c of cards) { const info = BC_SAMPLE_INFO[c.id]; if (info && missing(c.id)) { c.title = tr("Not included in the installer (BC's terms): downloads report {report}'s data from BC's public servers ({size} MB) after asking, converts it on this computer and keeps it.", { report: info.report, size: Math.round(info.bytes / 1048576) }); } } // the dialog's sizes (MB of 2^20 bytes)
  // TASKS.csv #3192 — ranked from the most useful to the least (SAMPLE_RANK); the mapping samples lead on Surface Geology (#3107), by id,
  // so a sample added later is not dropped from either list (an id not ranked goes last)
  const rank = (c) => { const i = SAMPLE_RANK.indexOf(c.id); return i < 0 ? SAMPLE_RANK.length : i; };
  const ranked = cards.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([c]) => c);
  const lead = SURFACE_LEAD.map((id) => ranked.find((c) => c.id === id)).filter(Boolean);
  const ordered = mode === "surface" ? [...lead, ...ranked.filter((c) => !lead.includes(c))] : ranked;
  return ordered.filter((c) => !(c.id === "woodjam" && missing("woodjam")));
}

// TASKS.csv #3100 — the BC samples are not in the installer (BC's terms): downloaded on first opening (Woodjam is not offered there)
// TASKS.csv #3192 — the samples in SAMPLE_RANK's order (the BC downloads together, where Silvertip ranks); #2829 Blake River, #3107 the
// open samples, #3100 the BC downloads
// TASKS.csv #3541 — one line per sample (the empty state shows it with its line breaks), not fifteen descriptions run together; the Macpass credit stays on its own sample's line
// TASKS.csv #4094 — where each sample's data is from, licence and what is real, one line per sample (shown under the list for the selected row, so a credit stays with its sample; the old
// footnote under the buttons was all of them at once). The Macpass credit is the owner's own words and follows its line (#3496). Silvertip, Harry and Perk-Rocky share one line (BC's terms).
const SOURCE_LINE = {
  wa_gold: () => tr("WA lode gold (WAMEX report A122506): 66 inclined holes from 2018-2019 on a gold prospect east of Kalgoorlie, with lithology, alteration, veining, oriented structures and 14,664 gold assays — nothing synthesized."),
  yk_macpass: () => tr("Macpass (Fireweed Metals Corp., Yukon): 559 holes drilled 1952-2023 on the Macpass project, with down-hole surveys, 32,546 sampled intervals (Ag, Pb, Zn) and 32,498 bulk densities — nothing synthesized.") + " " + MACPASS_CREDIT,
  qld_century: () => tr("Century (Geological Survey of Queensland, CC BY 4.0): 37 holes from 1992 on a shale-hosted zinc-lead-silver deposit, with lithology and assays, 730 soil samples and Geoscience Australia's magnetic grid — nothing synthesized."),
  wa_iron: () => tr("WA bedded iron (WAMEX report A119232): 147 shallow holes from 2018, with Geoscience Australia's magnetic grid — nothing synthesized."),
  wa_zinc_copper: () => tr("WA zinc-copper (WAMEX report A77713): 32 holes from 2007 on sulphide prospects in felsic volcanic rocks of the east Pilbara, with logs and assays, and 157 soil and 46 stream-sediment samples — nothing synthesized."),
  silvertip: () => tr("From BC's public assessment reports, downloaded from the Province's servers the first time you open them (BC's terms do not let GeoStrix include them): Silvertip (report #42807): 9 deep holes from 2024 with logs, oriented core and assays, and rock, soil and stream-sediment samples; Harry (report #37584): 37 holes with collars, lithology and assays; Perk-Rocky (report #42317): 2024 surface mapping (the geological map, structures and outcrop measurements as delivered) on a Copernicus terrain, to model from the map."),
  qc_rouyn_noranda: () => tr("Rouyn-Noranda (Quebec's SIGEOM, CC BY 4.0): the geology, 299 structural measurements and 280 historical drillhole traces of a 7 km block of the Abitibi, on a terrain, inside the Blake River gravity sample — nothing synthesized."),
  wa_lead_zinc: () => tr("WA lead-silver-zinc (WAMEX report A91581): 99 shallow holes from 2010 on a carbonate-hosted deposit in the east Kimberley, with lithology, weathering, assays and specific gravity — nothing synthesized."),
  wa_uranium: () => tr("WA palaeochannel uranium (WAMEX report A87304, CC BY 4.0): 430 shallow aircore and diamond holes from 2009-2010 through a lignite-bearing palaeochannel, with lithology, alteration, multi-element assays and a downhole gamma / eU3O8 log — nothing synthesized."),
  mount_raymond: () => tr("Mount Raymond (Geological Survey of Canada, Canadian Geoscience Map 71, northern Yukon): 1:50 000 bedrock mapping only — map units, faults, folds and 119 planar measurements on a terrain — to model from the map, nothing synthesized."),
  fi_lapland: () => tr("Central Lapland (Geological Survey of Finland, CC BY 4.0): the 1:1 000 000 bedrock map of a 100 km window of the greenstone belt and 121 whole-rock samples with full analyses, no drillholes — nothing synthesized."),
  blake: () => tr("Blake River gravity (a Geological Survey of Canada compilation, Abitibi, Quebec): the published Bouguer anomaly grid and the 7,810 stations behind it, no drillholes — nothing synthesized."),
  osborne: () => tr("Osborne magnetics (Geoscience Australia survey P1029, via Fatiando a Terra Data, CC BY 4.0): 24,927 airborne magnetic readings of the Osborne mine area and the 50 m Lightning Creek anomaly grid, no drillholes — nothing synthesized."),
  geomet: () => tr("GeoMet (IMPA, UFMG and Vale S.A., CC BY 4.0): 118 inclined holes and 1,999 assays of 18 elements, real analyses; the holes are reconstructed from the sample positions (the source has no surveys) on a local grid with no coordinate system."),
};
SOURCE_LINE.harry = SOURCE_LINE.perk = SOURCE_LINE.silvertip;
SOURCE_LINE.woodjam = () => tr("Woodjam (BC assessment report 41597): 19 diamond holes from 2023, six IP lines and the ZTEM 3D inversion — nothing synthesized.");
export const sampleSource = (id) => (SOURCE_LINE[id] ? SOURCE_LINE[id]() : "");
// the whole list at once (the order of the old footnote), for the tests and the licence page
export const sampleFootnote = () => [tr("No data of your own yet? Try a sample project."), ...["wa_gold", "yk_macpass", "qld_century", "wa_iron", "wa_zinc_copper", "silvertip", "qc_rouyn_noranda", "wa_lead_zinc", "wa_uranium", "mount_raymond", "fi_lapland", "blake", "osborne", "geomet"].map(sampleSource)].join("\n");

// ---------------------------------------------------------------------------------------------------------------------------------------------
// TASKS.csv #4094 (Matt, 2026-11-25: "better organize them", chose "the list") — what each sample really holds, for the empty 3D View's table. The six icons are
// what a sample contains, not a label: each claim names the file(s) that prove it (and the row count where it has one), and test/sampleContents4094.test.mjs
// reads every sample folder and fails if a claim names a file the folder lacks, a count differs from the file's rows, or a folder holds a kind of data no
// icon claims. A new sample (the Geoscience Queensland ones, #4056) is one entry here, one card in sampleCardsFor and its loader.
//   dir    the folder under sample_data/ (the BC ones are kept in the user's data folder: the test skips them unless a copy is found)
//   mb     the size on disk, as the list shows it; a BC sample not on this computer shows its download size instead (BC_SAMPLE_INFO)
//   has    icon -> { files: the proof, n: the rows of files[0] where it is a count }
//   facts  the short "what it has" line: [phrase, n?] (the phrases are sampleFact's, translated whole)
export const SAMPLE_ICONS = ["holes", "assays", "geophysics", "mapping", "surface", "terrain"];
export const SAMPLE_CONTENTS = {
  wa_gold: { name: "WA lode gold", style: "lode", dir: "wa_gold", mb: 1.7, has: { holes: { files: ["collars.csv"], n: 66 }, assays: { files: ["assays.csv"], n: 14664 } }, facts: [["holes", 66], ["logs"], ["assays", 14664], ["structures"]] },
  yk_macpass: { name: "Macpass", style: "znpbag", dir: "yk_macpass", mb: 3, has: { holes: { files: ["collars.csv"], n: 559 }, assays: { files: ["assays.csv"], n: 32546 } }, facts: [["holes", 559], ["assays", 32546], ["density"]] },
  qld_century: { name: "Century", style: "shale", dir: "qld_century", mb: 0.3, has: { holes: { files: ["collars.csv"], n: 37 }, assays: { files: ["assays.csv"], n: 1532 }, geophysics: { files: ["tmi_80m.tif"] }, surface: { files: ["soils.csv"], n: 730 } }, facts: [["holes", 37], ["assays"], ["soils", 730], ["magnetics"]] },
  wa_iron: { name: "WA iron", style: "iron", dir: "wa_iron", mb: 1, has: { holes: { files: ["collars.csv"], n: 147 }, assays: { files: ["assays.csv"], n: 4157 }, geophysics: { files: ["tmi_80m.tif", "logs.csv"] } }, facts: [["holes", 147], ["logs"], ["densityGamma"], ["magnetics"]] },
  wa_zinc_copper: { name: "WA zinc-copper", style: "volcanic", dir: "wa_zinc_copper", mb: 0.2, has: { holes: { files: ["collars.csv"], n: 32 }, assays: { files: ["assays.csv"], n: 1550 }, surface: { files: ["soils.csv", "streams.csv"], n: 157 } }, facts: [["holes", 32], ["assays"], ["soilsStreams", 203]] },
  silvertip: { name: "Silvertip", style: "agpbzn", dir: "silvertip", mb: 1.1, has: { holes: { files: ["collars.csv"], n: 9 }, assays: { files: ["assays.csv"], n: 1339 }, geophysics: { files: ["magsusc.csv"] }, surface: { files: ["rocks.csv", "soils.csv", "streams.csv"] } }, facts: [["deepHoles", 9], ["assays"], ["surfaceSamples", 606]] },
  // Woodjam is offered only where a copy exists (it is never downloaded: its ARIS package is 1.94 GB); its size is the copy's, not listed
  woodjam: { name: "Woodjam", style: "ipZtem", dir: "woodjam", mb: null, has: { holes: { files: ["collars.csv"], n: 19 }, assays: { files: ["assays.csv"] }, geophysics: { files: ["ztem_inversion_2023.omf"] } }, facts: [["holes", 19], ["assays"], ["ipLines", 6], ["ztem"]] },
  harry: { name: "Harry", style: "gold", dir: "harry_property", mb: 0.6, has: { holes: { files: ["collars.csv"], n: 37 }, assays: { files: ["assay_wide.csv"], n: 6297 } }, facts: [["holes", 37], ["assays"]] },
  qc_rouyn_noranda: { name: "Rouyn-Noranda", style: "camp", dir: "qc_rouyn_noranda", mb: 0.7, has: { holes: { files: ["collars.csv"], n: 280, traces: true }, mapping: { files: ["geology.zip"] }, terrain: { files: ["terrain_cdem_30m.tif"] } }, facts: [["structures", 299], ["traces", 280], ["geology"]] },
  wa_lead_zinc: { name: "WA lead-zinc", style: "carbonate", dir: "wa_lead_zinc", mb: 0.7, has: { holes: { files: ["collars.csv"], n: 99 }, assays: { files: ["assays.csv"], n: 5970 } }, facts: [["holes", 99], ["assays"], ["sg"]] },
  wa_uranium: { name: "WA uranium", style: "palaeochannel", dir: "wa_uranium", mb: 2.2, has: { holes: { files: ["collars.csv"], n: 430 }, assays: { files: ["assays.csv"], n: 9862 }, geophysics: { files: ["gamma.csv"] } }, facts: [["holes", 430], ["assays"], ["gamma"]] },
  mount_raymond: { name: "Mount Raymond", style: "mapSediments", dir: "mount_raymond", mb: 0.6, has: { mapping: { files: ["map_units.shp", "bedding.csv"] }, terrain: { files: ["terrain_cdem_90m.tif"] } }, facts: [["map"], ["structures", 119], ["terrain"]] },
  perk: { name: "Perk-Rocky", style: "mapBc", dir: "perk_rocky", mb: 0.8, has: { mapping: { files: [] }, terrain: { files: ["terrain_copernicus_glo30.tif"] } }, facts: [["mapping"], ["outcrop", 147]] },
  fi_lapland: { name: "Lapland", style: "greenstone", dir: "fi_lapland", mb: 0.6, has: { mapping: { files: ["bedrock_units.zip", "faults.zip"] }, surface: { files: ["rocks.csv"], n: 121 } }, facts: [["bedrockMap"], ["rocks", 121]] },
  blake: { name: "Blake River", style: "voltBelt", dir: "blake_river", mb: 1.4, has: { geophysics: { files: ["bouguer_100m.grd", "stations.csv"] } }, facts: [["gravityGrid"], ["stations", 7810]] },
  osborne: { name: "Osborne", style: "sill", dir: "osborne", mb: 1.3, has: { geophysics: { files: ["osborne_magnetic.csv", "lightning_creek_magnetic_grid.tif"] } }, facts: [["magnetics"], ["readings", 24927], ["grid50"]] },
  // the five Geoscience Queensland samples (#4056, side 2): their data keeps geophysics in a geophysics/ folder and mapping in mapping/ (a folder with files proves the icon); the
  // facts count only what a file's rows give exactly (the README's counts leave out the QC rows the files carry). They get a row when their card and loader land (sampleCardsFor).
  gsq_carbo_creek: { name: "Carbo Creek", style: "ipEm", dir: "gsq_carbo_creek", mb: 1.7, has: { holes: { files: ["collars.csv"], n: 3 }, assays: { files: ["assays.csv"], n: 111 }, geophysics: { files: ["geophysics"] } }, facts: [["holes", 3], ["assays"], ["ipLines", 7], ["groundEm"]] },
  gsq_cloncurry: { name: "Cloncurry", style: "cuAuCo", dir: "gsq_cloncurry", mb: 4.7, has: { holes: { files: ["collars.csv"], n: 5 }, assays: { files: ["assays.csv"], n: 541 }, geophysics: { files: ["geophysics"] }, mapping: { files: ["mapping"] }, surface: { files: ["soils.csv", "rocks.csv"], n: 468 } }, facts: [["holes", 5], ["assays"], ["soils", 468], ["dhem"], ["groundEm"], ["ip"]] },
  gsq_altia_south: { name: "Altia South", style: "dhem", dir: "gsq_altia_south", mb: 4.1, has: { holes: { files: ["collars.csv"], n: 9 }, assays: { files: ["assays.csv"], n: 1199 }, geophysics: { files: ["geophysics"] }, surface: { files: ["rocks.csv"], n: 10 } }, facts: [["holes", 9], ["assays"], ["rocks", 10], ["dhem"], ["groundEm"]] },
  gsq_black_mountain: { name: "Black Mountain", style: "greisen", dir: "gsq_black_mountain", mb: 3.1, has: { holes: { files: ["collars.csv"], n: 24 }, assays: { files: ["assays.csv"], n: 660 }, geophysics: { files: ["geophysics"] } }, facts: [["holes", 24], ["assays"], ["ip"], ["magnetics"]] },
  gsq_edinburgh_park: { name: "Edinburgh Park", style: "epithermal", dir: "gsq_edinburgh_park", mb: 2.1, has: { holes: { files: ["collars.csv"], n: 23 }, assays: { files: ["assays.csv"], n: 888 }, geophysics: { files: ["geophysics"] }, surface: { files: ["soils.csv", "rocks.csv", "streams.csv"], n: 1190 } }, facts: [["holes", 23], ["assays"], ["surfaceSamples", 1637], ["ip"], ["magnetics"]] },
  geomet: { name: "GeoMet", style: "research", dir: "geomet", mb: 0.4, has: { holes: { files: ["collars.csv"], n: 118 }, assays: { files: ["assays.csv"], n: 1999 } }, facts: [["holes", 118], ["assays", 1999], ["elements", 18]] },
};
// the short deposit-style phrases, whole and translated (the README / card wording; no style is assumed for a sample that does not state one)
export const sampleStyle = (key) => ({
  lode: tr("Lode gold"), znpbag: tr("Zn-Pb-Ag, Selwyn Basin"), shale: tr("Shale-hosted Zn-Pb-Ag"), iron: tr("Bedded iron under cover"), volcanic: tr("Zn-Cu sulphides in volcanics"),
  agpbzn: tr("Ag-Pb-Zn, northern BC"), gold: tr("Gold, BC"), camp: tr("Volcanic-belt camp"), carbonate: tr("Carbonate-hosted Pb-Ag-Zn"), palaeochannel: tr("Palaeochannel uranium"),
  mapSediments: tr("Mapping, Paleozoic sediments"), mapBc: tr("Mapping, central BC"), greenstone: tr("Greenstone belt, rock geochemistry"), voltBelt: tr("Volcanic belt, gravity"),
  sill: tr("Sill complex, magnetics"), research: tr("Research dataset"), ipZtem: tr("IP and ZTEM, central BC"),
  ipEm: tr("IP and ground EM, Queensland"), cuAuCo: tr("Cu-Au-Co, Mount Isa Inlier"), dhem: tr("Downhole EM, Queensland"), greisen: tr("Greisen molybdenum, Queensland"), epithermal: tr("Epithermal Au-Ag, Queensland"),
}[key] || "");
// one fact of the "what it has" line
export const sampleFact = ([k, n]) => ({
  holes: () => tr("{n} holes", { n: (n ?? 0).toLocaleString() }), deepHoles: () => tr("{n} deep holes", { n }), traces: () => tr("{n} hole traces", { n }), logs: () => tr("logs"),
  assays: () => (n == null ? tr("assays") : tr("{n} assays", { n: n.toLocaleString() })), structures: () => (n == null ? tr("structures") : tr("{n} structures", { n })), density: () => tr("density"),
  soils: () => tr("{n} soils", { n }), soilsStreams: () => tr("{n} soils and streams", { n }), surfaceSamples: () => tr("{n} rock, soil, stream samples", { n }), rocks: () => tr("{n} rock samples", { n }),
  magnetics: () => tr("magnetics"), densityGamma: () => tr("density, gamma"), sg: () => tr("specific gravity"), gamma: () => tr("gamma log"), geology: () => tr("geology"), map: () => tr("geological map"),
  terrain: () => tr("terrain"), mapping: () => tr("surface mapping"), outcrop: () => tr("{n} outcrop measurements", { n }), bedrockMap: () => tr("bedrock map"), gravityGrid: () => tr("gravity grid"),
  ipLines: () => tr("{n} IP lines", { n }), ip: () => tr("IP"), dhem: () => tr("downhole EM"), groundEm: () => tr("ground EM"), ztem: () => tr("ZTEM inversion"), stations: () => tr("{n} stations", { n: n.toLocaleString() }), readings: () => tr("{n} readings", { n: n.toLocaleString() }), grid50: () => tr("50 m grid"), elements: () => tr("{n} elements", { n }),
}[k]?.() || "");
// the table's rows for a tab: every offered sample (the cards sampleCardsFor offers, in its order) with what it holds; the first pick is the tab's own (#1120):
// the 3D View leads with Macpass, Surface Geology with the mapping samples. -> { rows, first }
export function sampleListFor(mode) {
  const cards = sampleCardsFor(mode);
  const rows = cards.filter((c) => SAMPLE_CONTENTS[c.id]).map((c) => {
    const d = SAMPLE_CONTENTS[c.id], info = BC_SAMPLE_INFO[c.id];
    const download = info && missing(c.id) ? Math.round(info.bytes / 1048576) : null;
    return { id: c.id, name: d.name, style: sampleStyle(d.style), has: d.has, facts: d.facts.map(sampleFact).filter(Boolean).join(" · "), mb: d.mb, download, title: c.title };
  });
  const lead = mode === "surface" ? SURFACE_LEAD[0] : SAMPLES_IN_VIEW[0];
  return { rows, first: rows.some((r) => r.id === lead) ? lead : rows[0]?.id || null };
}
// the table's filter: the rows holding EVERY chosen icon (several narrow) whose name, style or facts hold the search text; pure, so it is tested
export const filterSampleRows = (rows, icons, text) => {
  const needle = String(text || "").trim().toLowerCase();
  return rows.filter((r) => [...icons].every((k) => r.has[k]) && (!needle || `${r.name} ${r.style} ${r.facts}`.toLowerCase().includes(needle)));
};
