# Lithology codes from many logging systems, harmonized into the project's groups (TASKS.csv #2004) — design note

Written 2026-11-14, side session 3. Nothing built or downloaded yet.

## What is missing

A legacy database merges logs from many programs, each with its own codes: `BAS`, `Bslt`, `MB` (mafic basalt in one report, mudstone
breccia in another), `DOL`, `Dolerite`, `DIAB`. Today the project has:

- **#2163, a per-project code dictionary:** each code's meaning in this project, filled from the description logged beside it, editable.
- **#2386 / #2427, case variants:** `Dcb` / `DCB` / `DCb` offered as one group.
- **#1685, litho groups:** a code belongs to at most one group (Volcanic host, Intrusive, …), and the modelling tools read the groups.

What is still missing is the step between them. With 200 codes, the user builds the groups by hand, one chip at a time, and nothing
proposes "these 14 codes are all basalt".

## Proposal

**Suggest a group for each ungrouped code, from its meaning; never apply one unasked.**

1. **What a code means, in this order:**
   - (a) the project's dictionary entry (#2163: the file's own description, or the user's);
   - (b) the code itself read as a rock word when it is one (`Dolerite`, `basalt`, `granodiorite`);
   - (c) a thesaurus of rock names and their common abbreviations (below).
   - A code with no meaning from any of these is left alone and listed as "not recognized".
2. **Matching a meaning to a rock name:** our own Levenshtein distance on the words, normalized by length, plus token rules (`qtz` → quartz,
   `bx` → breccia, `porph` → porphyry). No third-party fuzzy library (dh2loop used fuzzywuzzy, which is GPL-2).
3. **From a rock name to a group:**
   - the project's existing groups, by the rock names already in them (a group holding "basalt" codes attracts the next basalt code);
   - else a new group proposed with the rock name as its name.
4. **The UI:** in 3D Modelling > Modelling codes (where the groups are made), a "Suggest groups" button lists each proposal:
   - code, its meaning and where that came from (dictionary / name / thesaurus), the proposed group, and a tick (all ticked);
   - one Apply writes the ticked codes into their groups, through the existing group setter, so it can be undone.
   - A code whose meaning differs between reports (#2163's `tie` / several descriptions) is listed unticked, with both meanings.
5. **Honesty:**
   - the confidence is shown (exact rock word, abbreviation rule, or fuzzy at distance d);
   - fuzzy matches start unticked;
   - nothing changes until Apply.

## The thesaurus (the one decision)

- **Option A — dh2loop's thesaurus CSVs** (Loop3D/dh2loop v1.0.0, MIT; Joshi et al. 2021, GMD 14, 6711).
  - About 1,600 rock names and their synonyms from the WA lithology lexicon, which fits the WA datasets this app is tested on.
  - It needs a download: into its own folder, licence checked first, data only (no code from the repository), with the source and licence
    in the file header and in PRIVACY.md / the licences list.
  - **This needs Matt's OK in this session before anything is downloaded.** The 2026-11-09 decision in TASKS.csv approved it in principle,
    after #2163, which is now done.
- **Option B — our own short thesaurus, written here:** about 150 common rock names and abbreviations (igneous, sedimentary, metamorphic,
  vein, breccia, regolith).
  - No download, and smaller.
  - It misses regional terms such as the WA regolith vocabulary.
- **Recommendation:** B first, so the suggestion UI and matching can be built and tested now; A added later as a second source, if Matt
  agrees to the download.

## Effort

- **Matching and suggestion logic** (pure, `lib/lithoHarmonize.js`, with tests on synthetic code lists): medium.
- **The "Suggest groups" list in Modelling codes:** medium. It is the 3D Modelling pane, side 5's area, so the UI part is theirs or agreed
  with them.
- **Option A's data:** small once the download is approved.
