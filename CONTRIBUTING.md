# Contributing to GeoStrix

Thanks for considering a contribution. GeoStrix is MIT-licensed specifically so smaller exploration
companies and independent consultants — the people this app is built for — can also help build it.

## Before you start

- **Open (or find) a GitHub issue first.** The project's working backlog is a private file kept by the
  maintainer (it holds verbatim user reports and real names, so it is not in this repo). Issues are the
  public channel: describe the feature or bug there before writing code. This avoids duplicated effort
  and lets a maintainer say whether it is already planned, any known constraints or prior attempts, and
  the intended approach before you've sunk time into it.
- **Read `README.md`** for the architecture overview and current feature set, and skim the module you're
  touching (`src/modules/`) — several are large single files with extensive inline comments explaining
  *why* code is shaped the way it is. Many cite a `TASKS.csv #N` id: that is an entry in the private
  backlog above, and the comment itself is meant to carry the reason. If one doesn't and you need the
  history, ask on an issue. Understand the constraint before changing the code around it.
- For anything nontrivial, open an issue or draft PR early to confirm direction before investing a lot
  of time — this is especially true for anything touching `src/lib/store.jsx` (shared project state)
  or `src/modules/ViewerModule.jsx` (the largest, most cross-cutting file in the app).

## Development setup

```bash
npm install
npm run dev
```

See `README.md`'s "Running in development" section for the optional Python sidecar setup (only needed
for the GemPy-based implicit modelling tools) and `npm run build` / `npm run build:dir` for producing
an installer or unpacked build.

## Code conventions

- **Comments explain *why*, not *what*.** A well-named function/variable already says what it does;
  comments in this codebase exist to record a non-obvious constraint, a rejected alternative, or the
  root cause of a bug. Existing ones often cite the backlog id that prompted the change (e.g.
  `// TASKS.csv #124 — ...`). In new code, write the reason out in the comment, and reference the GitHub
  issue number if there is one.
- **Prefer editing existing files over creating new ones**, and prefer the smallest change that
  correctly solves the stated problem over a broader refactor, new abstraction, or speculative
  generalization. Three similar lines beat a premature shared helper.
- **Don't add error handling, validation, or fallbacks for scenarios that can't happen.** Validate at
  real boundaries (user input, file imports, external APIs) — trust internal code and this project's own
  established data shapes elsewhere.
- Match the existing style of the file you're editing rather than reformatting unrelated code as a side
  effect of your change. There is no formatter. `npm run lint` (also run in CI) checks only for real
  bugs (undefined names, conditional hooks, duplicate keys…), and `npm test` runs the logic tests.

## Verification expectations

This project has a strict "prove it works before calling it done" habit — see `CLAUDE.md`'s
"Verification discipline" section for the full detail an AI assistant working on this repo follows; the
same expectations apply to human contributors:

1. **Syntax-check** any touched/new `.js`/`.jsx` file (`npx esbuild <file> --loader:.jsx=jsx
   --bundle=false --outfile=/tmp/check.js`) and confirm `npm run build` / `npm run build:dir` still
   succeeds.
2. **Hand-verify pure logic** (coordinate transforms, geometry math, parsers, classification rules) with
   a small script or test case wherever the function has a checkable input/output — don't just eyeball
   it.
3. **Actually run the feature** — `npm run dev` and click through the change yourself (or `npx vite` for
   the browser-fallback path if you don't need Electron-specific IPC). A type check passing is not the
   same as a feature working.
4. **Reproduce a bug before fixing it** if you're fixing one — confirm you can trigger the reported
   symptom first, so you know your fix actually addresses it rather than a plausible-sounding guess.
5. Use `sample_data/` (a synthetic dataset covering every import type) to test without needing your own
   real exploration data — see `sample_data/README.md`.

## Submitting a change

1. Fork the repo and create a branch off `master`.
2. Make your change, following the conventions above.
3. Run `npm run lint` and `npm test`.
4. Open a pull request that links the issue and describes what changed, why, and how you verified it
   (what you ran, what you clicked, what you saw). Keep PRs focused — one feature or fix per PR is much
   easier to review than a bundle of unrelated changes.
5. Be responsive to review feedback; this is a young project and maintainer bandwidth is limited, so a
   PR that's easy to review (small, well-described, already verified) will move faster than one that
   isn't.

## Reporting bugs

Open a GitHub issue with: what you did, what you expected, what actually happened, and your OS/GeoStrix
version. If it's intermittent or hard to reproduce, include as much detail as you can about what else
was happening (which module/tool was open, any recent action) — several past bugs in this project were
only fixable once a reliable repro sequence was found.

## License

By contributing, you agree your contribution is licensed under this project's MIT license (see
`LICENSE`).
