# Several elements in one estimate (TASKS.csv #3014) — design note

Written 2026-11-12. This is a plan, not a description of shipped behaviour.

## What is missing

The WA iron review (#2876) estimated Fe, then SiO2 on the same grid ("Match Fe estimate"). Each element is its own run (5-8 s each) and its own block model. As a result:

- Grade-tonnage reads one model. There is no "Fe ≥ 58 % with SiO2 < 4 % and Al2O3 < 2.5 %".
- The CSV export has one value column.
- A hard-boundary estimate (Break composites at the domain boundary + restrict the search) does not keep each block's domain, and its default name does not say "by Lithology".

## The shape: one model per element, on one lattice, as a set

Each block keeps a single `value`. The other elements live in sibling models on the same lattice, recorded as a set. They are not extra values inside each cell.

**Why not extra values per cell:** `c.value` is read by about 60 files (display, colour ramps, Identify, the pit / stope / dump tools, the exports, contours, the voxel shell…). A per-element value on every cell would mean either changing every reader, or a second idea of "the value" that half of them ignore.

**Why siblings:** they cost nothing for a single-element model, which stays exactly what it is today. And the lattice join already exists:

- `blockModelLattice` / `sameLattice`: Grade-tonnage's density model, #3012.
- The estimate / NN merge in `lib/estimateCheck.js`: #2547 / #3008.
- The Match grid: #2729.

### What a set is

- `params.set = { id, elements: ["Fe", "SiO2", "Al2O3"], primary: "Fe" }` on each member model.
- Members are written by one run, on one lattice (the matched or typed grid), with one search and one domain rule.
- A member removed on its own leaves the rest as a smaller set; the readers below check that the lattice still matches.
- A model with no `params.set` is a single-element model, as now. Nothing changes for it.

## Who changes

1. **Estimation (`GradeEstimationModal`, `estimation.js` / the worker).**
   - "Elements": the primary plus any others with values in the same samples.
   - Composite once per element. The interval lengths are shared, so the composites' positions are the same. Samples missing an element are left out *for that element*: its weights are worked out again where the sample sets differ.
   - For IDW / NN on the same samples, the neighbour search and the weights are shared, so N elements cost about one search plus N weighted sums. The worker returns one value column per element; kriging solves per element (its own variogram).
   - One "Add to project" adds the set. Names: "Fe estimate (set: Fe, SiO2, Al2O3)".
   - The hard-boundary rule adds a per-block domain column (`c.domain`, from the composite domains the search kept). The name says "by Lithology".
2. **Grade-tonnage (`GradeTonnageModal`, `lib/gradeTonnage.js`).**
   - Cut-offs stay on the model picked.
   - New "Limits from the set": each other member gets a ≤ / ≥ value. A block counts only when it meets every limit.
   - The table and CSV give each member's tonnage-weighted mean beside the primary's (Fe 60.1 %, SiO2 3.2 %, Al2O3 1.9 %).
   - Joined by lattice, as the density model is.
3. **Export (`lib/blockModelExport.js`).**
   - A set member exports with its siblings' value columns (`Fe_pct, SiO2_pct, Al2O3_pct`) behind one tick, "with the other elements of its set".
   - The default stays one column, so existing CSVs keep their shape.
   - OMF / VTK get one data array per member.
4. **Display.** None at first. Each member is a model in the Block models list, coloured on its own.
   - Later: an Identify line listing the set's values at the picked block (one lattice lookup).
5. **Pit (`pitShell.js` and the panes).**
   - Not in the first pass. A pit priced on Fe with penalties per SiO2 point is a revenue model, a separate row.
   - The panes may name the set in the pit's record.

## How a single-element model stays readable

- No `params.set`: every reader takes today's path.
- With a set, each member is still a complete ordinary model. Its own `value`, unit, name and params are readable alone.
- Only Grade-tonnage's limits and the export's extra columns look across the set.

## Splitting into rows

| Part | Scope | Size |
|---|---|---|
| a | The run: elements picker, shared search, the set added; per-block domain + "by \<layer\>" name | One session |
| b | Grade-tonnage limits from the set, and the per-member means in the table / CSV | One session |
| c | Export with the set's columns (CSV, OMF, VTK) | Small |
| d (later) | Identify's set line; a penalty revenue model for the pit | Separate rows |

## Open questions for Matt

- Should one run allow a different method per element (kriging for Fe, IDW for the penalties)? The shared-search saving assumes one method.
- Are LOI and calcined Fe (Fe / (1 − LOI/100)) wanted as derived members of a set, or kept for a block calculator?
