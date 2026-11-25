# The heavy lock (`scripts/heavy-lock.sh`)

One test Electron, full `npm test` or build at a time across the Claude sessions on this machine. Run it with **Git Bash** (its pids are
how a waiter tells a live session from a dead one).

```bash
bash scripts/heavy-lock.sh acquire "side 2 #4070 live check + full npm test" 10800   # wait in line, then hold it (exit 0)
# ... the live check, the full test ...
bash scripts/heavy-lock.sh release "side 2 #4070 live check + full npm test"         # the same line, word for word
bash scripts/heavy-lock.sh status                                                    # owner, how long, the queue in order
```

- **Owner line.** Start it with who you are (`side 2`, `main gate`, ...) and say what you run. `release` frees the lock only when
  `owner.txt` still holds that exact line, so keep it in a variable.
- **Queue.** `acquire` adds a file to `$TEMP/geostrix-heavy.queue/` (named by a sortable timestamp and its pid, holding the owner line)
  and takes the lock only when that file is **first** and `mkdir $TEMP/geostrix-heavy.lock` succeeds. First come, first served: no
  single slot to overwrite (the old `geostrix-heavy.next`, which lost a waiter's turn).
- **Timeout.** The second argument, in seconds (default 3 hours). On a timeout the waiter removes its own queue file and exits with **2**;
  it never touches the lock. Queue again if you still need it.
- **Waiting.** Run `acquire` in the background and continue when it ends; don't poll. While you wait, keep the lock's time short for others:
  have everything ready to run.
- **Dead waiters.** A queue file whose pid is gone (a session closed, a waiter killed) is removed by the next waiter that looks, with a
  line on stderr.
- **A lock nobody holds.** A lock older than `HEAVY_LOCK_STALE_MIN` minutes (default 120) whose holder pid is gone is reported with a
  WARNING by `status` and by waiters (once a minute). It is **never broken automatically**: ask its owner, or Main, to release it.
- **Hold it only while running.** Take it when the run is ready, release it the moment the run ends, including when the run fails.

Files: `$TEMP/geostrix-heavy.lock/owner.txt` (the owner line), `$TEMP/geostrix-heavy.lock/holder` (`<pid> <epoch seconds>`),
`$TEMP/geostrix-heavy.queue/<yyyymmddHHMMSSnnnnnnnnn>-<pid>`. `HEAVY_LOCK_DIR` moves all of them (the self-test uses a scratch folder);
`HEAVY_LOCK_POLL` is the poll interval in seconds (default 3).

Self-test: `bash scripts/heavy-lock-test.sh` checks three waiters served in order, a timeout that leaves the lock alone, a dead waiter's
queue file skipped, a dead holder's old lock reported and not broken, and a release by the wrong owner refused. It never touches the real lock.

**Switching over.** Waiters on the old `.next` slot and on this queue share the same lock directory but not the same line, so switch all
sessions together; `status` still shows a leftover `.next` so it can be cleared.
