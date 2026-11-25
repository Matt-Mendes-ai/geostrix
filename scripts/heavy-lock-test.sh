#!/usr/bin/env bash
# Self-test of scripts/heavy-lock.sh in a scratch folder (HEAVY_LOCK_DIR), never the real lock: first come, first served for three waiters, a
# timeout that leaves the queue and the lock alone, a dead waiter's queue file skipped, a dead holder's old lock reported but not broken, and a
# release by the wrong owner refused.  usage: bash scripts/heavy-lock-test.sh   (exit 0 = all passed)
set -u
HL="$(cd "$(dirname "$0")" && pwd)/heavy-lock.sh"
export HEAVY_LOCK_DIR; HEAVY_LOCK_DIR="$(mktemp -d)"
export HEAVY_LOCK_POLL=0.2
LOCK="$HEAVY_LOCK_DIR/geostrix-heavy.lock" QUEUE="$HEAVY_LOCK_DIR/geostrix-heavy.queue"
fails=0
ok() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; fails=$((fails + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
dead_pid() { sleep 0 & local p=$!; wait "$p" 2>/dev/null; echo "$p"; }
queued() { ls -1 "$QUEUE" 2>/dev/null | wc -l | tr -d ' '; }
wait_queued() { for _ in $(seq 1 100); do [ "$(queued)" -ge "$1" ] && return 0; sleep 0.1; done; return 1; }

# 1. three waiters behind a holder are served in the order they queued
bash "$HL" acquire "A holder" 5 2>/dev/null
check "A takes a free lock at once" '[ "$(head -1 "$LOCK/owner.txt")" = "A holder" ]'
ORDER="$HEAVY_LOCK_DIR/order"; : > "$ORDER"
for w in B C D; do
  ( bash "$HL" acquire "$w waiter" 30 2>/dev/null && { echo "$w" >> "$ORDER"; sleep 0.3; bash "$HL" release "$w waiter" 2>/dev/null; } ) &
  wait_queued "$(( $(printf 'B\nC\nD\n' | grep -n "^$w$" | cut -d: -f1) ))" # the next one starts only once this one is in the queue
done
check "three waiters queued" '[ "$(queued)" = 3 ]'
check "status lists them in order" '[ "$(bash "$HL" status | grep "^queue" | sed "s/^queue [0-9]*: \([BCD]\).*/\1/" | tr -d "\n")" = BCD ]'
bash "$HL" release "A holder" 2>/dev/null
wait
check "served first come, first served: B, C, D" '[ "$(tr -d "\n" < "$ORDER")" = BCD ]'
check "the lock is free and the queue empty after" '[ ! -d "$LOCK" ] && [ "$(queued)" = 0 ]'

# 2. a timeout leaves the queue and does not touch the lock
bash "$HL" acquire "X holder" 5 2>/dev/null
bash "$HL" acquire "T waiter" 1 2>/dev/null; rc=$?
check "a waiter times out with exit 2" '[ "$rc" = 2 ]'
check "its queue file is gone" '[ "$(queued)" = 0 ]'
check "the lock still belongs to X" '[ "$(head -1 "$LOCK/owner.txt")" = "X holder" ]'

# 3. a release by another owner line is refused
bash "$HL" release "someone else" 2>/dev/null; rc=$?
check "release by the wrong owner refused (exit 1), the lock kept" '[ "$rc" = 1 ] && [ -d "$LOCK" ]'
bash "$HL" release "X holder" 2>/dev/null

# 4. a dead waiter's queue file, first in line, is skipped and removed
mkdir -p "$QUEUE"; ghost="00000000000000000000000-$(dead_pid)"; echo "ghost waiter" > "$QUEUE/$ghost"
err=$(bash "$HL" acquire "S waiter" 5 2>&1 >/dev/null); rc=$?
check "a live waiter behind a dead one gets the lock" '[ "$rc" = 0 ] && [ "$(head -1 "$LOCK/owner.txt")" = "S waiter" ]'
check "the dead entry was removed and said so" '[ ! -e "$QUEUE/$ghost" ] && printf "%s" "$err" | grep -q "removed a stale queue entry"'
bash "$HL" release "S waiter" 2>/dev/null

# 5. an old lock whose holder is gone is reported loudly and never broken
mkdir "$LOCK"; echo "old owner" > "$LOCK/owner.txt"; echo "$(dead_pid) $(( $(date +%s) - 600 ))" > "$LOCK/holder"
out=$(HEAVY_LOCK_STALE_MIN=5 bash "$HL" status 2>&1)
check "status names the owner and warns" 'printf "%s" "$out" | grep -q "owner: old owner" && printf "%s" "$out" | grep -q "WARNING: the lock has been held for 10 min"'
HEAVY_LOCK_STALE_MIN=5 bash "$HL" acquire "W waiter" 1 2>/dev/null; rc=$?
check "a waiter does not break it (times out instead)" '[ "$rc" = 2 ] && [ "$(head -1 "$LOCK/owner.txt")" = "old owner" ]'

rm -rf "$HEAVY_LOCK_DIR"
[ "$fails" = 0 ] && echo "all passed" || echo "$fails failed"
exit "$fails"
