# Soil and stream-sediment geochemistry tools for GeoStrix

Ideas only, nothing built. Written 2026-10-24 for TASKS.csv #839 (Matt: "I want ideas, not code: WHAT soil and
stream-sediment geochemistry tools should GeoStrix offer?"). The brief: think like an exploration geologist running
a soil grid or a regional stream-sediment program, from planning the survey to picking follow-up targets.

Where a standard method is named, the reference is given so it can be checked; where practitioners disagree, the
disagreement is stated rather than settled. No data, results or performance figures are claimed for anything here.

## 0. What GeoStrix has today (checked in the code), and how it could be extended

| Today | What it actually does | Extension |
|---|---|---|
| Surface-sample import (`SurfaceImportModal.jsx`, #228) | One row per sample with its own x / y / z and a sampling medium (soil, rock chip, stream sediment, talus fines, other); element columns and units auto-detected with the assay importer's helpers; samples coloured by medium on the map and in 3D (`layers.js` MEDIUM_COLORS). | Add the descriptive fields a field program records (horizon, depth, colour, landform, size fraction, sample type, lab batch) so the levelling and QA/QC tools below have something to group by. Confirm that below-detection "<" qualifiers are kept for surface samples the way `geochem.js` keeps them for assays. |
| Grade statistics (`GradeStatistics.jsx`, #136 / #228) | Univariate statistics (n, mean, median, SD, percentiles, log statistics) for one element; for surface samples the grouping dimension is the medium. | Group by any descriptive field (horizon, lithology, landform, batch) and add the robust threshold estimators of section 4.1 to the same panel. |
| Geochemical diagrams (`GeochemModule.jsx`) | Ternary, bivariate and REE-spider diagrams, Jensen cation and Winchester & Floyd lithology plots, box plots by protolith, a correlation matrix (#21); plots export to CSV / PNG / SVG. These are whole-rock classification tools at "screening level". | Add the exploration-geochemistry plots: cumulative-probability plots, box plots by group with the fences drawn, and element-vs-element plots coloured by group. |
| IDW gridding (`idw.js`, #235) | Pure-JS inverse-distance gridding of a point layer into a raster drape. | Grid only inside the sampled area and within a maximum distance of a sample, and contour the grid (`contours.js` already contours terrain). |
| Lab QA/QC (`qaqc.js`, #134; `labCertificate.js`, #601) | For drillhole assays: standards against their certified values with control limits, blanks, duplicate pairs (HARD-type precision), control charts in sample order; ALS certificate CSVs joined to the sample table by sample id, with QC-type suggestions for the inserts. | Run the same engine over surface-sample ids: it is the same problem with a different sample table. |
| Terrain and derivatives | Terrain from AWS Terrain Tiles (SRTM blended with national DEMs, CDEM in Canada), Copernicus GLO-30 as a cross-check (#814), manual DEM import; hillshade, contours, slope, aspect, curvature (#237 / #797); adaptive mesh up to 1,025 x 1,025 nodes (#796). | The stream-sediment tools (section 5) need flow routing on this grid: flow direction, accumulation, catchments. Nothing of that exists yet. |
| Map layers, imagery, spectral indices, layouts | WMS / WFS layers (#127), shapefile / GeoPackage, Sentinel-2 imagery (#204 / #816), ASTER / Sentinel-2 / Landsat / EMIT indices (#783 / #806 / #807), graduated symbology for numeric layers (#122), print layouts. | Anomaly maps are mostly symbology and legends on what exists; the gap is the geochemistry behind the classes, not the drawing. |
| Drillhole planning (`holePlanning.js`) | Planned holes with azimuth / dip / length. | A follow-up target polygon (section 6.3) should hand off to it. |

## 1. Planning a survey

### 1.1 Soil-grid planner
- **What the geologist gets:** draw the area, set the baseline azimuth, line spacing and station spacing (with an
  optional offset pattern), and get the planned stations as a layer with line and station numbers, plus the counts:
  stations, line-kilometres, and days at a crew rate the user types.
- **Why it matters:** the first decision of a soil program is spacing versus budget. Lines go across the expected
  strike, and a target should be crossed by at least two or three stations, so station spacing follows the expected
  width of the anomaly (Rose, Hawkes & Webb 1979, *Geochemistry in Mineral Exploration*, 2nd ed., ch. on survey
  design). Seeing "25 x 100 m over this polygon is 1,840 samples and 46 line-km" before the crew leaves is the point.
- **Who:** everyone running soil grids. **Size:** medium.

### 1.2 Stream-sediment site planner
- **What:** from the terrain, a stream network with Strahler order (Strahler 1957) and a proposed site list at the
  first- and second-order confluences, each with its catchment area, so the planner can aim at a catchment size
  (regional programs commonly target one site per few square kilometres; BC's RGS averages roughly one site per
  7–13 km²) and see the gaps.
- **Why:** site density and catchment size decide what a stream program can detect; planning on a hillshade by hand is
  slow and misses small catchments.
- **Who:** anyone running stream programs (a specialist tool, but central to that work). **Size:** large, because it
  needs the flow-routing engine of section 5.1; small once that exists.

### 1.3 Site list and GPS export
- **What:** planned stations or sites exported as GPX / KML / CSV with the sample numbers, and a printable site list
  (page per line) for the field book.
- **Why:** the crew navigates with a handheld GPS or a phone; a list they cannot load is not a plan.
- **Who:** everyone. **Size:** small.

### 1.4 Sample-number scheme and QC insert plan
- **What:** a numbering scheme (prefix, year, running number) applied to the planned list, with QC inserts reserved
  in the stream (for example a standard every 20th, a blank every 30th, a field duplicate every 20th) and a check that
  numbers are never reused across the project.
- **Why:** QC inserts planned before sampling are inserted; inserts planned after the lab results arrive do not exist.
  Reuse of a sample number is the most common cause of a result sitting on the wrong site.
- **Who:** everyone. **Size:** small.

### 1.5 Orientation-survey comparison
- **What:** a small comparison panel for an orientation survey over a known occurrence: the same sites sampled in
  several media, horizons, size fractions or digestions, shown side by side (contrast = anomaly / background per
  variant).
- **Why:** choosing the medium and fraction is the one decision that cannot be fixed later; orientation surveys are
  the standard way to make it (Rose, Hawkes & Webb 1979; Levson 2001 for tills in the Cordillera).
- **Who:** specialists. **Size:** small to medium (mostly a grouped comparison of what 3.1 computes).

### 1.6 Access and ground-condition screen
- **What:** slope, aspect, wetland / glacier / water from the terrain and imagery, shown under the planned sites with
  a per-site flag ("steeper than 35°", "on ice").
- **Why:** removes sites nobody can reach before the helicopter is booked.
- **Who:** nice-to-have. **Size:** small (slope and imagery already exist).

## 2. Field data and QA/QC

### 2.1 Field-sheet fields on surface samples
- **What:** a standard descriptive schema on the surface-sample importer: horizon (Ah / B / C, or depth), colour,
  moisture, organic content, slope position, landform (till, colluvium, residual, alluvium, outwash), contamination
  notes, sample type (soil, moss mat, active sediment, heavy-mineral concentrate, BLEG), size fraction, photo file
  name; imported from the CSV that field apps and notebooks already produce.
- **Why:** every levelling and background decision later groups by these fields; without them the only grouping is
  the medium.
- **Who:** everyone. **Size:** small to medium (data model, import mapping, display).

### 2.2 QA/QC for surface samples
- **What:** the drillhole QA/QC engine (#134 / #601) run on surface-sample ids: certified reference materials on
  control charts with ±2 SD / ±3 SD limits, blanks against a detection-limit multiple, field duplicates and lab
  duplicates on relative-difference plots, by lab batch / certificate. Thompson & Howarth (1976, 1978) precision
  plots for the duplicate pairs; the practical review of what to monitor is Abzalov (2008, *Exploration and Mining
  Geology* 17, 131–144).
- **Why:** it decides whether a batch can be used at all, and whether a weak anomaly is real or lab noise. Field
  duplicates of soils are typically much noisier than lab duplicates: the field pair measures sampling variance, the
  lab pair analytical variance, and the two should be shown apart.
- **Who:** everyone. **Size:** medium (mostly reuse).

### 2.3 Below-detection and censored values
- **What:** one explicit rule per project for values reported as "<DL" (half the detection limit by default), the
  percentage censored shown per element, and a warning when it is high (above about 30 % the statistics of that
  element are mostly about the detection limit). The rule is written into every statistic and map that uses it.
- **Why:** gold and pathfinders in soils are often half censored; silent substitution changes thresholds.
- **Disagreement:** substitution (half DL) is the common field practice (Reimann et al. 2008, *Statistical Data
  Analysis Explained*); Helsel (2012, *Statistics for Censored Environmental Data*) argues it biases everything and
  prefers censored-data estimators. A first release can offer substitution and state it; the estimators can come
  later for the statistics panel.
- **Who:** everyone. **Size:** small.

### 2.4 Lab, method and batch tracking
- **What:** lab, analytical package, digestion (aqua regia, four-acid, fusion, fire assay), date and certificate per
  sample, with a flag where elements from different digestions are mixed in one map (for example Cr, Al, Ti or Ba are
  partial in aqua regia and near-total in four-acid, so the two cannot share a threshold).
- **Why:** multi-year programs change labs and packages; the maps must say which numbers are comparable.
- **Who:** everyone with more than one batch. **Size:** small to medium.

### 2.5 Portable XRF field data
- **What:** import pXRF readings as a surface layer, and a per-element regression of pXRF against lab values on the
  samples that have both, so pXRF can be used as a screen with a stated error.
- **Why:** pXRF on soils is common for Cu, Zn, As, Pb, Fe, Mn; it is useless for Au and unreliable for light elements,
  and the regression shows which elements it can be trusted for on this project.
- **Who:** nice-to-have. **Size:** medium.

## 3. Levelling and background

### 3.1 Populations and background by group
- **What:** statistics and distributions for an element by any descriptive field: medium, horizon, lithology or map
  unit (from an imported geology layer, point-in-polygon), landform, lab batch, survey year. Group medians and MADs,
  box plots per group with Tukey fences, and robust z-scores within each group, (x − median) / MAD, so that a value
  is judged against its own background.
- **Why:** a soil over a mafic volcanic has a different Cu background from a soil over granite, and a C-horizon
  sample from a B-horizon one; comparing them on one scale produces lithology maps, not anomaly maps. The robust
  statistics are the recommendation of Reimann, Filzmoser & Garrett (2005, *Science of the Total Environment* 346,
  1–16), Tukey (1977) and Kürzl (1988, *Journal of Geochemical Exploration* 30, 309–322).
- **Who:** everyone. **Size:** medium.

### 3.2 Levelling between surveys, labs and years
- **What:** when merging batches or old surveys, level one population to another by matching medians or quantiles of
  overlapping groups, with the adjustment shown per batch and an audit record on every levelled value (raw value
  kept).
- **Why:** nearly every property has two or three generations of soil data from different labs; without levelling the
  map shows the survey boundaries.
- **Disagreement:** levelling by statistics is routine in regional compilations, but the IGCP 259 recommendations
  (Darnley et al. 1995) hold that batches should be tied through shared reference materials or re-assayed overlap
  samples, and that statistical levelling without them can erase or create anomalies. The tool should prefer tie
  samples when they exist and label statistical levelling as such.
- **Who:** everyone merging data. **Size:** medium.

### 3.3 Logs and log-ratios
- **What:** log scale by default for maps, histograms and statistics of trace elements; an option for centred
  log-ratio (clr) or additive log-ratio (alr) transforms with a plain explanation.
- **Why:** concentrations are parts of a closed sum (Aitchison 1986, *The Statistical Analysis of Compositional
  Data*); ratios and multi-element sums on raw ppm can be artefacts of closure. Filzmoser, Hron & Reimann (2009,
  *Science of the Total Environment* 407, 6100–6108) show the problems for univariate work. Most exploration
  geologists still work on raw ppm and logs; offer both and label which one a map used.
- **Who:** specialists; the log default helps everyone. **Size:** small to medium.

### 3.4 Scavenging correction (Fe, Mn, organic carbon)
- **What:** residuals of an element against Fe and Mn (regression within the population), or a simple ratio, as an
  alternative map, for elements that iron and manganese oxides scavenge in streams and seepage zones (Zn, Cu, Co, Ni,
  As, Pb).
- **Why:** an iron-rich seep looks like a metal anomaly on raw values; the residual map removes the part explained by
  scavenging. The regression approach is set out in Carranza (2009, *Geochemical Anomaly and Mineral Prospectivity
  Mapping in GIS*, Elsevier) and used in catchment work by Bonham-Carter, Rogers & Ellwood (1987).
- **Who:** specialists. **Size:** small to medium.

## 4. Anomaly definition

### 4.1 Threshold toolkit
- **What:** for an element and population, the candidate thresholds side by side, each drawn on the histogram and the
  cumulative-probability plot:
  percentiles (90th / 95th / 98th), mean + 2 SD (Hawkes & Webb 1962, the historical rule), median + 2 MAD and the
  Tukey upper fence (Reimann et al. 2005; Tukey 1977), inflection points on the probability plot partitioned into
  populations (Lepeltier 1969; Sinclair 1974, 1976 *Applications of Probability Graphs in Mineral Exploration*, AEG
  Special Volume 4; Sinclair 1991), and the concentration–area fractal method (Cheng, Agterberg & Ballantyne 1994,
  *Journal of Geochemical Exploration* 51, 109–130). The geologist picks one; the choice and its value are stored and
  printed in the map legend.
- **Why:** the threshold is the anomaly map. Showing the candidates together stops the common practice of taking
  whichever rule gives the answer wanted, and records the decision.
- **Disagreement:** real and long-running. Mean + 2 SD assumes a normal (or log-normal) single population, which
  soil data rarely are; Reimann et al. (2005) favour robust estimators or the probability plot; fractal methods are
  argued to separate anomalies better where populations overlap but depend on the spatial sampling. There is no
  consensus, which is the argument for offering several with their assumptions stated.
- **Who:** everyone. **Size:** medium.

### 4.2 Pathfinder indices by deposit type
- **What:** presets that combine the elements that travel with a deposit type into one score per sample, as a sum
  of robust z-scores (from 3.1) with the formula shown and editable, plus user-defined indices. Starting suites, from
  the deposit-model literature rather than from any one survey:
  - porphyry Cu (± Au, Mo): Cu, Mo, Au, Ag (core), with Zn, Mn, Pb as the outer halo (Sillitoe 2010, *Economic
    Geology* 105, 3–41; Halley, Dilles & Tosdal 2015, *SEG Newsletter* 100);
  - epithermal Au–Ag: Au, Ag, As, Sb, Hg, Tl, Se, Te (Hedenquist, Arribas & Gonzalez-Urien 2000, *Reviews in Economic
    Geology* 13);
  - VMS: Cu, Zn, Pb, Ag, Au, Ba, Hg, Tl (Galley, Hannington & Jonasson 2007, GAC Special Publication 5);
  - orogenic Au: Au, As, Sb, W, Bi, Te (Goldfarb et al. 2005, *Economic Geology* 100th Anniversary Volume);
  - Carlin-type Au: Au, As, Sb, Hg, Tl (Cline et al. 2005, same volume);
  - sediment-hosted Zn–Pb (SEDEX / MVT): Zn, Pb, Ag, Ba, Tl, Mn (Leach et al. 2005, same volume);
  - magmatic Ni–Cu–PGE: Ni, Cu, Co, Cr, Pt, Pd (Naldrett 2004, *Magmatic Sulfide Deposits*);
  - LCT pegmatites / lithium: Li, Cs, Rb, Ta, Sn, Be, Nb and the K/Rb ratio (Selway, Breaks & Tindle 2005, *Exploration
    and Mining Geology* 14, 1–30);
  - unconformity uranium: U, Ni, Co, As, B, Pb (Jefferson et al. 2007, GSC Bulletin 588);
  - IOCG: Cu, Au, U, REE, Co (Williams et al. 2005, 100th Anniversary Volume).
- **Why:** a single-element map of Au in soils is noisy; three or four pathfinders agreeing is what a geologist walks
  to. The index is a transparent way to ask "do they agree here".
- **Disagreement:** the suites vary with cover, climate and weathering (an arid regolith and a glaciated till do not
  carry the same elements), and additive indices are criticized as arbitrary against multivariate methods (4.3). The
  preset is a starting point to be edited on the orientation survey, not a classifier.
- **Who:** everyone. **Size:** medium.

### 4.3 Principal components and factor maps
- **What:** PCA on log-ratio-transformed data within a population, with the loadings shown and the scores mapped.
- **Why:** finds element associations the geologist did not name (a lithology factor, a scavenging factor, a
  mineralization factor) and separates them. The approach is reviewed by Grunsky (2010, *Geochemistry: Exploration,
  Environment, Analysis* 10, 27–74) and Grunsky & de Caritat (2020, same journal, 20, 217–232).
- **Who:** specialists. **Size:** medium.

### 4.4 Spatial coherence
- **What:** for each anomalous sample, the count of anomalous neighbours within a distance (or on the adjacent
  stations and lines), so a one-station spike is separated from a three-line anomaly; a "coherent anomalies only"
  filter for the map.
- **Why:** single-sample highs are usually nuggets, contamination or a transcription error; coherent ones are the
  targets. This is the first thing an experienced geologist does by eye, and it is cheap to compute.
- **Who:** everyone. **Size:** small.

### 4.5 Up-ice and down-slope vectoring
- **What:** for soils over till, apply an ice-flow direction (from striae in the structure tools, or typed) to show
  where the up-ice source of a dispersal train could sit, with the train length as a slider; for residual soils on
  slopes, the up-slope equivalent.
- **Why:** in glaciated terrain (most of British Columbia) a soil anomaly in till can sit kilometres down-ice of its
  source; the dispersal-train idea is from Shilts (1976) and the Cordilleran practice from Levson (2001, in *Drift
  Exploration in Glaciated Terrain*, Geological Society Special Publication 185) and McClenaghan, Thorleifson & DiLabio
  (2000, *Ore Geology Reviews* 16, 145–166).
- **Who:** specialists in glaciated or steep terrain; everyone in BC. **Size:** medium.

### 4.6 Partial and selective leach data
- **What:** treat MMI, Enzyme Leach and similar data as their own populations and offer the "response ratio" map
  (value divided by the lower quartile of the survey) their providers recommend (Mann et al. 2005, *Geochemistry:
  Exploration, Environment, Analysis* 5, 201–210).
- **Disagreement:** whether these leaches see through tens of metres of cover is contested; Cameron et al. (2004, same
  journal, 4, 7–32) review the mechanisms and the mixed results. GeoStrix should display the data as the provider
  intends and say nothing about depth.
- **Who:** niche. **Size:** small.

## 5. Stream-sediment specifics

### 5.1 Catchments from the terrain
- **What:** flow direction and accumulation on the terrain grid (D8, O'Callaghan & Mark 1984; D-infinity,
  Tarboton 1997, as the later refinement), the stream network, and for each sample site snapped to its stream the
  upstream catchment polygon with its area, mean slope and, with a geology layer loaded, the fraction of each map
  unit.
- **Why:** a stream-sediment sample represents its catchment, not its point; every stream tool below needs the
  polygon. The catchment-basin approach is Bonham-Carter, Rogers & Ellwood (1987, *Journal of Geochemical
  Exploration* 29, 259–278).
- **Who:** anyone running stream programs. **Size:** large (a hydrology engine on the existing terrain grid; the
  grids are at most about a million nodes, so this is in-browser work without the Python engine).

### 5.2 Dilution correction and productivity ranking
- **What:** Hawkes' (1976, *Journal of Geochemical Exploration* 6, 345–358) correction: a site's excess over
  background times its catchment area, (Me − Mb) × Aa, as the "productivity" of the catchment, ranked; the
  background Mb comes from the population tools, and the assumptions (uniform erosion, clastic dispersion) are
  stated beside the ranking.
- **Why:** a modest value from a large catchment can mean a bigger source than a high value from a tiny one; the
  raw map ranks them the wrong way round.
- **Disagreement:** the correction assumes uniform erosion and clastic transport; it over-corrects large catchments
  with lakes or flat valleys and does nothing for hydromorphic metals. Carranza (2009) gives the GIS workflow and the
  caveats.
- **Who:** stream programs. **Size:** small once 5.1 exists.

### 5.3 Drainage ranking and follow-up reaches
- **What:** anomalous sites chained upstream: where a downstream site is anomalous and the next upstream site is
  not, the reach between them is flagged as the one to walk; a ranked table of catchments by index score, number of
  anomalous elements, productivity and catchment lithology; export of the reaches as lines for the GPS.
- **Why:** the follow-up of a stream program is a list of creeks to walk with a pan or a rock hammer; this builds
  the list.
- **Who:** stream programs. **Size:** medium.

### 5.4 Sample type and size fraction as populations
- **What:** sample type (active sediment, moss mat, heavy-mineral concentrate, BLEG) and size fraction (−80 mesh /
  −177 µm is the usual sediment fraction in Canadian practice) carried on each sample and treated as separate
  populations, never averaged together; a nugget warning on gold in sediments.
- **Why:** gold in a stream sediment is a few grains; Fletcher & Day (1989, *Transactions of the Institution of
  Mining and Metallurgy* B98, 130–136) and Fletcher (1997, in *Proceedings of Exploration 97*) show how hydraulic
  sorting makes gold values depend on the site and fraction more than on the source. Moss mats (Matysek & Day 1988,
  BC Geological Fieldwork 1987) trap the fine heavy fraction and give more reproducible gold than active sediment in
  the Cordillera; HMC and BLEG are different measurements again.
- **Who:** stream programs. **Size:** small.

### 5.5 Catchment-lithology background
- **What:** the expected background of an element in each catchment from its lithology mix (a regression of element
  on map-unit fractions across the survey), and the residual as the anomaly map.
- **Why:** removes the "it is high because the catchment is all basalt" explanation before anyone drives out.
- **Who:** specialists. **Size:** medium (needs 5.1 and a vector geology layer, which WFS / shapefile import provides).

### 5.6 Stream-water chemistry
- **What:** pH, conductivity, sulphate, uranium and fluoride from water samples (the RGS collects them) displayed with
  the sediments and usable in the same thresholds.
- **Why:** low pH and high sulphate in a creek are the cheapest sulphide indicator there is.
- **Who:** nice-to-have. **Size:** small.

## 6. Maps and outputs

### 6.1 Anomaly maps with the rule in the legend
- **What:** symbol size and colour by percentile class (the usual 50 / 75 / 90 / 95 / 98 breaks) or by the threshold
  from 4.1, with the rule, population and censoring treatment written in the legend; posted values; one element or
  one index per map; multi-element "agreement" maps from 4.2.
- **Why:** a soil map without its threshold rule cannot be reviewed; the rule in the legend is what a QP or a partner
  asks for first.
- **Who:** everyone. **Size:** small to medium (graduated symbology exists; the legend text and the class source are
  the new part).

### 6.2 Gridding and contours with honest limits
- **What:** IDW grids restricted to the sampled hull and to a maximum distance from a sample, contoured, with the
  samples drawn on top and a note of the search parameters.
- **Why:** contoured soil maps are what managements and partners expect, and what hides a two-line survey behind a
  smooth blob.
- **Disagreement:** Reimann et al. (2008) and many statisticians argue against smoothing point geochemistry at all
  (point symbols only); most exploration geologists contour anyway. Offer the grid with its limits visible.
- **Who:** everyone. **Size:** small.

### 6.3 Follow-up target polygons and ranking
- **What:** polygons drawn or proposed around coherent anomalies (4.4 clusters, 5.3 catchments), each with a score
  (index, size, number of elements, productivity, proximity to known mineral occurrences, access), a ranked target
  table, export as GPX / shapefile / DXF, and a hand-off to the hole planner.
- **Why:** this is the deliverable of the whole program: a ranked list of places to go next and why.
- **Who:** everyone. **Size:** medium.

### 6.4 Survey report
- **What:** a report assembling the survey plan, QA/QC results, thresholds and levelling decisions, the maps and the
  target table, from the records the tools above keep.
- **Why:** the assessment report, the partner update and the 43-101 technical report all need the same facts; the
  existing Report tool shows the pattern.
- **Who:** everyone. **Size:** medium.

### 6.5 Line profiles
- **What:** element values along a soil line over the terrain profile, several elements stacked.
- **Why:** shows seepage and slope effects (an anomaly at the base of every slope is drainage, not mineralization)
  that a map hides.
- **Who:** everyone. **Size:** small.

## 7. Public regional data

### 7.1 British Columbia Regional Geochemical Survey (RGS)
- **What:** import the BC Geological Survey's RGS stream-sediment and water data (collected since 1976, −80 mesh
  sediments with INAA and ICP analyses, waters with pH, U, F; the data are published through the BC Data Catalogue
  and MapPlace) as a surface layer with its field metadata, and use it in three ways: the regional percentile of the
  property's own samples (how unusual is 300 ppm Cu here, for this catchment lithology), the regional anomalous
  catchments near the property, and the unexplored drainages to rank.
- **Why:** it is the one dataset every BC explorer starts from; many properties were staked on an RGS anomaly.
- **Honesty:** RGS data span fifty years of labs and methods, so 3.2 (levelling) and 2.4 (method tracking) apply
  before any property sample is compared to it; and the licence of each catalogue record must be read before a
  built-in fetch is shipped (#816 found BC's imagery service was access-only).
- **Who:** everyone in BC. **Size:** medium (an importer with a known schema, the catalogue download, and the
  regional-percentile context).

### 7.2 Rest of Canada
- Geological Survey of Canada's National Geochemical Reconnaissance (lake and stream sediments; Friske & Hornbrook
  1991, *Transactions of the Institution of Mining and Metallurgy* B100, 47–56) and the Canadian Database of
  Geochemical Surveys; Yukon's RGS; Ontario's lake-sediment surveys; Quebec's SIGEOM stream and lake data. The same
  importer with a schema per source.

### 7.3 Elsewhere, in GeoStrix's languages
- Australia: the National Geochemical Survey of Australia (catchment-outlet sediments; de Caritat & Cooper 2011) and
  the state surveys' stream and laterite data.
- USA: the USGS National Geochemical Database (including the NURE stream sediments of the 1970s–80s) and the
  conterminous-US soil survey (Smith et al. 2014, USGS Open-File Report 2014-1082).
- Europe: FOREGS Geochemical Atlas of Europe (Salminen et al. 2005) and GEMAS (Reimann et al. 2014).
- Brazil (Geological Survey of Brazil, SGB-CPRM, regional stream-sediment surveys), Peru (INGEMMET), Mexico (SGM),
  Chile (SERNAGEOMIN): regional stream-sediment programs with open portals of varying completeness.
- Each needs its licence checked and its schema mapped; none should be promised before that.

### 7.4 What the public data is for, and what it is not
- For: background and thresholds in regional context, finding whether the property sits on a known regional
  anomaly, and ranking drainages nobody has sampled since the 1980s.
- Not for: property-scale anomaly maps (the density is a site per several square kilometres), or comparisons across
  decades without levelling.

## Top 5 for a first release

1. **Threshold toolkit with populations by group (4.1 + 3.1).** Everyone uses it, it is the foundation of every
   anomaly map, and it turns the existing grade-statistics panel into an exploration tool. Medium.
2. **QA/QC for surface samples with a censoring rule (2.2 + 2.3).** Mostly reuse of #134 / #601, needed before any
   anomaly is believed, and expected by anyone reviewing the work. Medium.
3. **Pathfinder indices by deposit type, with anomaly maps that carry their rule (4.2 + 6.1 + 4.4).** The multi-element
   question is the one a geologist actually asks of a soil grid; the coherence filter removes the nuggets. Medium.
4. **Soil-grid planner with sample numbering and GPS export (1.1 + 1.3 + 1.4).** It is where a program starts, it is
   what a field crew would open GeoStrix for, and it is small enough to ship early. Medium.
5. **Catchments from the terrain, dilution correction and drainage ranking (5.1 + 5.2 + 5.3).** Without it GeoStrix
   has nothing stream-specific; with it a regional program can be planned, ranked and followed up in one place. It is
   the one large item, and it reuses the terrain the app already fetches. Large.

The first follow-on would be the **BC RGS import (7.1)**: if most users are in BC it could replace item 4 in the
first release, since it makes item 5 immediately useful on public data before a company has its own.

## Deliberately left out

- **Lab portal and LIMS integration.** Certificates as files (the #601 path) cover it; live lab links are maintenance
  for every lab.
- **A certified-reference-material database.** Certified values and SDs belong to the CRM suppliers; the user types
  them (as #134 already does).
- **Full multivariate and machine-learning prospectivity modelling.** Better done in R (the `rgr` package, Garrett
  2013; `compositions`), ioGAS, or Python; GeoStrix should export clean, levelled, grouped data instead of competing.
- **Indicator-mineral identification, isotopes, biogeochemistry, hydrogeochemistry beyond display.** Specialist
  laboratories and specialists' software.
- **A mobile field-capture app.** Field crews already use apps and notebooks; GeoStrix imports what they produce.
- **Depth interpretation of partial leaches, or any "see-through-cover" claim.** Contested science; show the data as
  the provider intends and no more.
- **Three-dimensional soil geochemistry or "AI target generation".** The data are two-dimensional and sparse; a
  ranked target table with the reasons shown is honest, a generated target is theatre.
- **Dilution correction beyond Hawkes' simple form** (sediment-yield or erosion models). Needs data nobody has at the
  property scale.

## Questions whose answers change the priorities

1. **Deposit types and terrain first:** porphyry, epithermal and VMS in glaciated British Columbia, or also lithium
   pegmatites, orogenic gold and laterite terrain in Brazil, West Africa or Australia? The pathfinder presets, the
   up-ice tools and the choice of media differ.
2. **Which public data:** BC RGS alone, or also GSC / Yukon / Ontario / Quebec, Australia's NGSA and state surveys,
   the USGS databases, Brazil, Peru and Mexico? Each is an importer and a licence check.
3. **Will field crews use GeoStrix** for planning, GPS export and field sheets, or only the project geologist after
   the lab results come back? If the crews will not, items 1.x shrink to a numbered site export.
4. **What do your soil and stream programs actually insert** as standards, blanks and duplicates, at what rate, and
   from which labs and packages (aqua-regia ICP-MS, four-acid, fire assay)? That decides the batch tracking and
   whether the certificate parser needs more lab formats than ALS.
5. **Stream programs:** active sediment at −80 mesh only, or also moss mats, heavy-mineral concentrates and BLEG, and
   do you already have catchment polygons from past programs that GeoStrix should read rather than compute?
