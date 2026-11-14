# QC link table that arrives after the assays (TASKS.csv #3409): design note

Written 2026-11-14, side session 3. Nothing built. This is options and a recommendation for Main and Matt; no code changed.

## What happens today

- The Geochem assay import knows the **QC columns** (#2340): a sample id, a sample type or QC category, and a parent (original) sample id.
  A table that has those columns but **no results** (a *link table*: `SampleID`, `Orig_SampleID`, `QC_Category`) is recognized and the dialog says
  it holds no results ("this table links check samples to their originals ... but holds no results").
- It is a refusal, not a route. The review that raised it (a WA palaeochannel project) had exactly this shape:
  `assays_1.csv` holds the originals' results, `assays_2.csv` links 988 check samples (818 lab checks, 170 field duplicates) to 964 of those
  originals, and **no check sample's result is in either file**. No duplicate pair can be built from these two files by any route, so the
  honest outcome for this exact review is "nothing to pair". The case worth designing for is the one where the link table arrives **after** the
  assays and the check samples' results are already imported.
- Stored assay rows carry `hole_id`, `from`, `to`, `values`, and the QC fields the import kept (`sample_id`, `sample_type`, `parent_id` when mapped at
  import). A table imported earlier **without** QC columns mapped has no `sample_id` on its rows at all, which is the first thing the link
  needs.

## What the user wants

"Mark the assay rows I already have, by sample id, with the QC category and the parent from this table", so the existing QC tools (duplicate
pairs, blank and standard charts, the exclusion of QC inserts from compositing and statistics) see them as check samples.

## Options

**A. Join at import time only (what exists).** The link table must come with the results, or after them as a second import that re-reads the
results. Cost: none. Limit: a project that already has 40,000 assays has to re-import them to get a link. This is the status quo.

**B. A "QC links" import that updates rows already in the project (recommended).**
- A new small import target, "QC links", reached from the same place #2340's sentence is shown ("import it as QC links"): the user maps
  *Sample ID*, *Parent sample* and *QC category / type*.
- It needs the assay rows to carry a sample id. Two cases:
  - the rows already have `sample_id` (the assays were imported with the sample column mapped): the join is exact, by sample id;
  - the rows do not: the dialog says so plainly and offers to re-import the assays with their sample column (no guessing a join by hole and
    depth, which would silently mismatch).
- The result per matched row: `sample_type` set from the category (through the same `sampleTypeClass` words the import uses) and `parent_id` set.
  Rows not matched are counted and the first few named; link rows whose sample id is not in the assays are counted too (that is the review's
  case: all 988).
- Written through the existing assay setter, so undo works (one step: "QC links").
- Size: a small lib (`lib/qcLinks.js`: match, apply, report; pure, about 80 lines), a small dialog reusing the column picker the assay import
  already has, a few strings. About one day; no dependency, no stored-shape change beyond filling fields rows already have.

**C. A separate link table kept beside the assays.** Store `qcLinks: [{ sample_id, parent_id, category }]` in the project and let every QC
reader join it at read time. Pros: nothing is written onto rows, the links can be re-imported or removed cleanly. Cons: every QC reader
(duplicate pairs, charts, the QC filter in compositing / statistics / best intercepts) must learn the join, and the rows still need a
sample id to join on, so it has the same prerequisite as B with more plumbing. Not recommended unless link tables need to be removed.

**D. Guess the pairing by hole and depth when rows have no sample id.** A field duplicate sits at the same hole and interval as its
original, so the pair could be found without ids. Tempting, and exactly the silent mismatch to avoid: a duplicate taken over a split
interval, a re-sampled interval or an overlap would be paired wrongly and the charts would look authoritative. Only as a *suggestion* the user
confirms, never applied unasked.

## Recommendation

**B**, in two steps. (1) A "QC links" target that matches by sample id, applies type and parent, reports matched / unmatched, and says plainly
when the stored assays have no sample ids. (2) Later, if wanted, D as a confirm-each suggestion for projects whose assays lack sample ids.

## Questions for Matt

1. Do his projects usually have the sample column mapped at the first assay import? If so B is enough as written.
2. For a link table with no check results (the WA case): is "matched 0 of 988; the check samples' results are not in the project" the right
   message, or should the dialog refuse earlier ("there is nothing to link to")?
3. Should a link also be able to *create* the check rows' grade pairing in the QC charts when the check results are in a **second** assay file
   imported later (the common lab-batch case)? That is B plus "import assays: add to the existing table" and is already how #336's merge works.

## Not in scope

- Changing how assays are stored, or a general sample-id column on every layer.
- Reading lab certificate PDFs or LIMS exports (#2340's guesses cover the column names only).
