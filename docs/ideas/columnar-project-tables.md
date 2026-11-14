# Columnar project tables (TASKS.csv #2206, with #3140)

Status: design for Main's review (2026-11-14, side 6). Nothing is built yet. It covers the load, save, autosave and undo paths, how old
files are read, and what #2206 shares with side 2's #3140 (typed-column downhole logs).

## 1. What already exists

#2206 was written on 2026-11-08 from #2173's measurements. Several of the "store it as columns" steps it asks for were already done, or
have been done since:

| Piece | Row | What it does |
|---|---|---|
| `lib/compactTable.js` compactTable / expandTable | #555 | Writes **assays**, every big **interval layer** (except geophys_pts) and **surface samples** as exact columns once a table has 2,000+ rows. A numeric field is one comma-joined string; any other field is a dictionary plus codes; assay `values` become one column per element. Exact round trip; a WeakMap cache per rows array. |
| compactCustomLayers | #2334 | The same for **custom layers'** `rows`. |
| compactTableSliced, projectPartsSliced | #3104 | The autosave encodes one column per task, so a cold encode no longer freezes the window. |
| Cache seeded on open | #3118 | expandTable puts the stored form into the cache, so the first save after an open writes the file's own text back without encoding it again. |
| undoTableCap | #2894 | The undo history (references to each step's fields) drops the oldest big removed custom layers and replaced assay tables. |

Not done:
- the **survey** table and **collars** are still one JSON object per row in the file;
- **in memory**, every collection is an array of row objects;
- the file is parsed and expanded **in one piece on the main thread** (store.jsx `JSON.parse` at open, then fieldsFromPayload).

## 2. Measured (Node, on this machine with other sessions at full load, so times are upper bounds)

A. A synthetic project the size of #2173's: 10,544 holes; 201,964 assay intervals x 10 elements; a 5-station survey per hole (52,720
rows); a 160,000-row RQD layer; a 500,000-reading custom point log (scratchpad `big2206.mjs`). Saved with today's compactors:

| | Today |
|---|---|
| Rows in memory | 133 MB of heap |
| First save of new data (compact + stringify) | 3,449 + 321 ms (later saves: 274 ms, cached) |
| File | 33 MB: assays 19, custom layers 7, survey 4 (rows), layers 2, collars 2 |
| Open: `JSON.parse` | 541 ms, 38 MB |
| Open: expand to rows (fieldsFromPayload) | 2,448 ms, 163 MB held after |
| Per row, loaded | about 143 bytes |

B. #2173's own test file (side session 6d8b20ed's `t2173/big.geostrix.json`, written as rows by its generator, not by GeoStrix): 53 MB.
Its `JSON.parse` took 3,761 ms and held 102 MB; expanding it took 30 ms, because it has nothing compact. The same data saved by GeoStrix
today would be measurement A's shape.

So today an open of a project this size costs:
- about **0.5 s parsing** (the compact strings parse fast);
- about **2.4 s building row objects**, on the main thread in one go;
- **130-160 MB** of row objects.

A save of data already on file costs little (#3118). Survey is the only big table still written as rows.

## 3. Where a columnar in-memory form helps, and what it costs

Kept as columns in memory (typed arrays for numbers, dictionary codes for strings), the same tables would hold roughly:
- about 8 bytes a number;
- 4 bytes a code;
- one entry per distinct string.

For measurement A that is under 40 MB instead of about 133 MB. The 2.4 s row build at open would go entirely, and the save would encode
columns directly.

The cost is the readers:
- `assays` is read in about 156 source files (61 of them read `row.values[...]`);
- custom layers' `rows` in about 58;
- `survey` in about 220 (mostly through desurvey and the hole lists).

Code relies on rows being plain objects:
- `{ ...row, x }` copies, which a getter-backed view would not copy;
- WeakMaps and Sets keyed by row identity (the pick tips, #3118's cache, intercept exclusions);
- `rows.filter(...)` producing new arrays of the same rows;
- React dependencies on the array.

A switch of everything at once is not realistic, and a half-switched store that turns tables into rows on demand would rebuild the row
objects on first touch, which the 3D View does at open anyway. The gain needs the **heavy readers** moved to columns. Everything else
keeps rows through an adapter until it is worth moving.

## 4. Proposal, in three phases

### Phase 1: file and open, no in-memory change (small; can go first)

1. **Survey through compactTable** (`save: compactTable`, `load: expandTable`, `tables` for #3104's sliced autosave), as assays are. It
   removes about 60 % of survey's 4 MB on measurement A (to be measured). It needs PROJECT_VERSION + 1: #342 warns an older GeoStrix.
   The reader already accepts both rows and the compact form, so old files open unchanged.
2. **Expand in slices at open.** fieldsFromPayload's expanders run as a sliced task, like #3104's save: a table decoded column by column,
   rows built 20,000 at a time between frames. The 2.4 s still has to be spent, but the window keeps answering and the progress can be
   shown. Optionally the parse and the column decoding go to a worker. The worker sends back typed arrays (transferable, no copy) and the
   main thread only builds the rows. That pays only if row building, not decoding, dominates; to be measured before doing it.
3. A faster `decodeAll` for numeric columns: one scan of the joined string into a Float64Array instead of `split` then `Number`. To be
   measured; exactness kept, because the text is the same.

### Phase 2: a shared table type with a row adapter (the design #3140 asks for)

`src/lib/rowTable.js`, shared by #2206 and #3140:

```
Table = { __table: 1, length, cols: { name: Float64Array | { dict: [], codes: Int32Array } }, nested?: { values: { Au: Float64Array, ... } }, meta }
tableFromRows(rows)      // exact; absent = NaN for numbers, -1 for codes (null kept apart from absent, as compactTable does)
rowsOf(table)            // the row objects, built once per table and cached (WeakMap): the same objects every call, frozen (#721)
colOf(table, name)       // a typed column for hot readers (no rows built)
valuesOf(table, sym)     // one assay element's column
isTable(x)               // a store value may be rows or a Table during the migration
withRows(table, edits)   // copy-on-write: a new Table sharing the columns that did not change
```

- **The store.** For the big kinds, the value can be a Table: assays, survey, the big interval layers, and custom layers' `rows` (#3140's
  binned logs first). The store is store.jsx, Main's file, so any change there goes through Main. Every reader that is not migrated calls
  `rowsOf(value)`, a no-op on an array. That keeps identity: rowsOf returns the same objects for the same table, so WeakMaps and Sets
  keyed by row still work.
- **Saving.** A Table's compact form is its columns, encoded straight from the typed arrays and cached per table, so no rows are walked.
  The file format is #555's, unchanged, so files stay readable both ways.
- **Loading.** expandTable gains `asTable`: it decodes the columns into a Table and builds no rows. Old files hold rows or the v10+
  compact form; both become Tables (`tableFromRows` for rows).
- **Undo.** Steps keep references, as now. A Table is immutable (edits make a new one through withRows), so the history is exactly as
  safe. #2894's cap counts `table.length` instead of `rows.length`.
- **Readers moved to columns first** (where the rows are walked whole, per frame or per open):
  - the 3D assay markers (buildAssaySpheres, `assayRange`, #3055's batcher);
  - the legend's ppmAsPercent (#3305);
  - layerPrimitivesFor (#3298), and through it the Level plan and sections;
  - desurvey's grouping of survey by hole;
  - the Downhole logs track;
  - Estimation's `sourceAssays`.

  Every other reader keeps rows through rowsOf until a profile says otherwise.

### Phase 3: rows only where they are needed

With the hot readers on columns, `rowsOf` runs only when a cold reader asks: the Holes list, Identify on one hole, an export. Rows can then
be built per hole on demand (`rowsOfHole(table, id)` from a hole index kept with the table), and the full rows array is never made on open.
This is where the heap falls from about 133 MB to under 40 MB on measurement A.

## 5. How #2206 and #3140 share it

#3140 (side 2) asks for typed columns for binned downhole logs: a 2.58 M-reading log should not be millions of objects in
`customLayers[].rows`. It also asks for an adapter (`rowsOf(layer)`) and for the save, load and undo-cap paths.

Both should use the one `rowTable.js` above:
- `rowsOf` and `colOf` mean the same thing for an assay table, a survey table and a log layer's rows;
- a custom layer's `rows` may be a Table;
- compactCustomLayers saves a Table as its columns;
- #2894's cap reads `length`.

Suggested split:
- side 6 writes rowTable.js, the store adapter points (with Main) and the assay / survey / interval-layer migrations;
- side 2 converts the binned-log import to make a Table and migrates the log readers (Downhole logs, the 3D log LOD #2937, the KMZ export).

Both are then tested against the same round-trip tests.

## 6. Risks

- **Spread copies of rows** (`{ ...row }`) on a row from rowsOf are fine: they are real objects. Code that writes into a row breaks, as it
  should (#721 made them immutable already).
- **A migrated reader that compares rows by identity** with an unmigrated one: the rows from rowsOf are the identities, so no mismatch, as
  long as nobody builds their own row objects from columns.
- **React**: a Table is one object per version, like an array, so dependency arrays work unchanged.
- **Workers** (Phase 1 option): the CSP allows the app's own workers already (lib/*Client.js). A worker parse needs the file's text sent
  in (a copy of up to ~50 MB). Measure first.
- **Partial migration** must never leave the same data in two forms that can disagree. The Table is the only stored form; rows are
  derived from it and cached.

## 7. Old files and versions

- Every version so far stores rows, or #555's compact form from v10. Both are read by expandTable today and will be read into Tables in
  Phase 2. Nothing changes in the file in Phase 2, so no version bump.
- Phase 1's survey compaction is the only format change: PROJECT_VERSION + 1, with #342's warning in an older GeoStrix. A pinned
  fingerprint test as #555's.
- Round-trip tests (projectFields): rows -> file -> Table -> rowsOf deep-equal to the input; v9 / v10 / current files open with the same
  rows; an undo after an edit restores the old Table object.

## 8. Questions for Main

1. Phase 1 first (survey compaction, sliced expand, a faster decoder) as its own row? It is small and gives the open its responsiveness
   back without touching the readers.
2. Phase 2 touches store.jsx (the stored value of four fields becomes "rows or Table"): do you want to make those edits, or hand them to
   me with the file?
3. Is the split with side 2 for #3140 as in section 5 acceptable to both of you?
