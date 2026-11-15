# A method per element, and a block calculator (TASKS.csv #3164) — design note

Written 2026-11-14 (side 5). This is a plan, not a description of shipped behaviour. Matt's decisions (2026-11-13, on the row):

1. One estimation run may use a different method per element (e.g. ordinary kriging for Au, IDW for Fe). The default stays one method for
   every element, and the method used is stated per element in the result.
2. A general block calculator (formulas over the estimated block values, units stated) instead of special derived set members. It covers
   LOI-corrected / calcined Fe, metal equivalents and NSR for any deposit type, and #3178's pit-revenue half (penalties per point of SiO2 /
   Al2O3). No default prices or factors that read as facts (#264).

## 1. A method per element

### What exists (#3014 / #3163)

The Estimation dialog's set ("Elements": the primary plus others) composites and places each member, then:

- a member whose sample points are the primary's runs inside the primary's own neighbour search, reusing its weights (NN, IDW, MLS). That
  is one search for the set (`opts.members`, estimation.js `memberValuesAt`);
- every other member runs on its own with the same grid, search and domain rule (`baseOpts`); under kriging each member fits its own
  variogram.

### The change

- Each member row in the dialog gets a "Method" select. Its first choice is "as {primary}", the default, which keeps today's behaviour
  exactly. The others are the methods the dialog offers for the primary (NN, IDW 1 / 2 / 3, MLS, ordinary kriging).
- A member whose method equals the primary's (and is not kriging, and the run is not log10) keeps the shared search, as now. A member with
  its own method runs on its own: `runEstimation(mp, { ...baseOpts, method: memberMethod, ...(kriging ? { variogram: { model: vgModel } } : {}) })`.
  Under kriging the member fits its own variogram, as an own-run kriging member does today.
- The grid, search radius, min / max samples, min holes, per-hole cap and domain rule stay shared: the set is still one lattice and one
  search, so Grade-tonnage's limits and the set export keep joining by lattice.
- Stated per element:
  - each member model's `params.method` is its own;
  - the result list says "{el}: {method}, {blocks} blocks from {n} composites, mean ...";
  - the member name follows the primary's naming, with the method in the record (not the name).
- Remembered with the dialog's settings (estimateMemory), per element.
- No engine change. Only the modal's member loop picks the method; estimation.js is untouched.

### Tests

- A set where Fe is IDW² and Au ordinary kriging: Au's model equals Au estimated alone with OK on the same grid and search; Fe's equals
  Fe alone with IDW².
- "As primary" keeps the shared search: the same values as today, no extra run.
- params.method per member; the result line; the remembered choice.

## 2. A block calculator

### What it is

A dialog that makes a NEW block model whose value is a formula over block models on one lattice:

- Inputs: the user picks block models; the first one picked fixes the lattice, and only models on the same lattice
  (`blockModelLattice` / `sameLattice`, as Grade-tonnage's density model) can be added. A set's members are offered together. Each input
  gets a variable name: the element symbol for an estimate (Fe, SiO2, LOI), else a short name the user can edit; names are unique and
  follow calcExpr's rules (or [quoted names]).
- Formula: the field calculator's language (lib/calcExpr.js, #344 / #554: no eval). Arithmetic, ^, min / max / abs / sqrt / log / exp /
  round, comparisons, and / or, if(cond, a, b).
- Result: a name and a UNIT, both required (no unit = no Add: a block value must say what it is). Optionally the colour ramp of the first
  input.
- A block gets a value only when every input the formula reads has a value there; otherwise the block is left out, never zero (calcExpr
  gives NaN for a missing operand, so the block is skipped). The dialog says how many blocks got a value and how many were left out, and
  why (missing inputs / the formula's own blank, e.g. a division by zero).
- The new model is an ordinary block model on that lattice:
  - source "calc";
  - params.calc = { formula, inputs: [{ var, model name, unit }], unit };
  - its cells carry x, y, z, dx, dy, dz, value;
  - it is listed, coloured, exported, picked by Grade-tonnage and Identify like any other.
  - It is a snapshot: changing an input later does not change it. Its record names its inputs, so it can be made again.

### No numbers that read as facts (#264)

- The formula field starts EMPTY.
- The help shows the syntax with symbolic examples:
  - `Fe / (1 - LOI / 100)` (calcined Fe: an identity, no factor);
  - `Cu + Au * k` ("k: your gold-to-copper factor");
  - `Fe * p - max(0, SiO2 - s) * q` ("p, q, s: your price, penalty per point and threshold").
  They are text, not prefilled values, and the help says GeoStrix proposes no price, recovery or penalty.
- #3178's pit revenue with SiO2 / Al2O3 penalties is such a formula. The pit tools then use the calculated model as their value model, as
  they use any block model.

### Where

- A "Block calculator…" button beside the Grade-tonnage launcher in 3D Modelling's Grade estimation pane (ModellingPanes.jsx, side 5's
  file), shown when there are two or more block models on one lattice, or one model (a formula of a single model, e.g. a unit change, is
  allowed).
- The dialog is lazy-loaded (lazyModal, as GradeTonnageModal), so the startup JavaScript does not grow.
- New: src/lib/blockCalc.js (pure: the lattice join, the evaluation, the counts) and src/components/BlockCalculatorModal.jsx. New UI
  strings through tr() in es / pt / fr / ar.

### Performance

- The join is by lattice index: one Map from a cell's (i, j, k) to its value per input, built once per input (the same key as
  estimateCheck's). The formula is compiled once (compileCalc) and evaluated per block.
- 7.4 M-block lattices hold only their estimated cells (37,500 on WA iron's Fe), so this is milliseconds to a second.
- Above 200,000 blocks the evaluation runs in slices with progress and Cancel (the pattern of #3060's cell building).

### Tests

- The lattice join: blocks present in every input, absent where any input misses, values exact.
- The formula: calcined Fe on known numbers; an if() penalty; division by zero leaves the block out and is counted.
- Inputs on a different lattice are refused, with the reason.
- The new model's params.calc, unit and name; no default formula; the help's examples carry no numbers for prices / factors.
- Wiring: the launcher, the lazy modal, the strings in the four locales.

## Order

1. A method per element (small: the modal's member loop, the select, the result line).
2. The block calculator (lib, modal, launcher).
Each is its own commit, with live checks on WA iron (Fe, SiO2, Al2O3, LOI) or a bundled sample.
