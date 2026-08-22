---
description: Append a completed or explicitly-deferred unit of work to TASKS.csv, without implementing anything new
---

Do NOT write or modify any application code in this command. Its only job is to get TASKS.csv
accurately caught up with reality.

1. Figure out what unit(s) of work need logging — either from what Matt just described in chat,
   or from a diff of currently uncommitted changes (`git status` / `git diff`) if he's asking you
   to log work that's already sitting in the working tree.
2. For each one, either:
   - Update an existing `Planned` row's `status` to `Done` (or `Blocked`, if that's accurate) if
     it already exists in `TASKS.csv`, or
   - Append a brand-new row (pick the next unused `id`) if this was an ad hoc request never
     tracked before.
3. Write a detailed `notes` entry for each — matching the style of existing entries: verbatim
   request quoted where relevant, root cause for bug fixes, exact files/functions touched, and
   what verification was (or wasn't) done. If something is only partially done or was deferred,
   say so explicitly rather than marking it `Done` — an honest `Blocked`/partial note beats an
   inaccurate `Done`.
4. Show Matt the new/updated row(s) before considering this finished.

This command exists so nothing falls through the cracks when there's a backlog of work to log
but no time/need to implement anything new right now.
