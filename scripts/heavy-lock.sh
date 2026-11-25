#!/usr/bin/env bash
# The heavy lock: one test Electron, one full npm test or one build at a time across the Claude sessions on this machine (TASKS.csv #4070 follow-up,
# Main 2026-11-25). A FIFO queue replaces the single .next slot, which a second waiter overwrote, so the first one lost its turn (3 hours).
#
#   bash scripts/heavy-lock.sh acquire "<owner line>" [timeout_s]   wait in line, then take the lock (exit 0); on timeout leave the line (exit 2)
#   bash scripts/heavy-lock.sh release "<owner line>"               free the lock, only if owner.txt is still this line (exit 0; else 1)
#   bash scripts/heavy-lock.sh status                               the owner (with its age) and the queue, in order
#
# The owner line starts with who you are ("side 2 #4070 live check ...") so status and the other sessions can tell. Hold the lock only while running.
# Files (override the folder with HEAVY_LOCK_DIR, as the self-test does):
#   $DIR/geostrix-heavy.lock/      the lock (mkdir is the atomic step); owner.txt = the owner line, holder = "<pid> <epoch s>"
#   $DIR/geostrix-heavy.queue/     one file per waiter, named <yyyymmddHHMMSSnnnnnnnnn>-<pid>, holding its owner line; sorted by name = first come, first served
# Rules: a waiter takes the lock only when its own file is first AND its mkdir succeeds; it writes owner.txt only then and removes its file. A queue
# file whose pid is dead is removed (said on stderr). A lock is never broken: one held longer than HEAVY_LOCK_STALE_MIN minutes (default 120) whose
# holder pid is gone is reported loudly, for a person or Main to decide. Pids are Git Bash (MSYS) pids: every session must run this with Git Bash.
set -u
DIR="${HEAVY_LOCK_DIR:-${TEMP:-/tmp}}"
LOCK="$DIR/geostrix-heavy.lock"
QUEUE="$DIR/geostrix-heavy.queue"
STALE_MIN="${HEAVY_LOCK_STALE_MIN:-120}"
POLL="${HEAVY_LOCK_POLL:-3}"

alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }
now() { date +%s; }
pid_of() { local n="${1##*/}"; printf '%s' "${n##*-}"; } # the pid at the end of a queue file's name

# remove the queue files of waiters that are gone; print the live ones in order
queue_live() {
  local f p
  for f in $(ls -1 "$QUEUE" 2>/dev/null | sort); do
    p=$(pid_of "$f")
    if alive "$p"; then printf '%s\n' "$f"; else
      echo "heavy-lock: removed a stale queue entry (pid $p gone): $(head -1 "$QUEUE/$f" 2>/dev/null)" >&2
      rm -f "$QUEUE/$f"
    fi
  done
}

# a lock held too long by a holder that is gone: said loudly, never broken
stale_report() {
  [ -d "$LOCK" ] || return 0
  local hp ht age
  hp=""; ht=""; [ -f "$LOCK/holder" ] && read -r hp ht < "$LOCK/holder" # a lock taken without this script has no holder file
  [ -n "$ht" ] || return 0
  age=$(( ($(now) - ht) / 60 ))
  if [ "$age" -ge "$STALE_MIN" ] && ! alive "$hp"; then
    echo "heavy-lock: WARNING: the lock has been held for $age min and its holder (pid $hp) is gone. Owner: $(head -1 "$LOCK/owner.txt" 2>/dev/null). It is NOT broken automatically: ask its owner (or Main) to release it." >&2
  fi
}

acquire() {
  local owner="${1:?usage: heavy-lock.sh acquire \"<owner line>\" [timeout_s]}" timeout="${2:-10800}" name me end last_warn=0 first
  mkdir -p "$QUEUE" || exit 3
  name="$(date +%Y%m%d%H%M%S%N)-$$"
  me="$QUEUE/$name"
  printf '%s\n' "$owner" > "$me" || exit 3
  trap 'rm -f "$me"' EXIT
  trap 'rm -f "$me"; exit 130' INT TERM
  echo "heavy-lock: queued $(date +%T) as $name" >&2
  end=$(( SECONDS + timeout ))
  while :; do
    first=$(queue_live | head -1)
    if [ "$first" = "$name" ] && mkdir "$LOCK" 2>/dev/null; then
      printf '%s\n' "$owner" > "$LOCK/owner.txt"
      printf '%s %s\n' "$$" "$(now)" > "$LOCK/holder"
      rm -f "$me"; trap - EXIT INT TERM
      echo "heavy-lock: LOCKED $(date +%T)" >&2
      return 0
    fi
    if [ "$SECONDS" -ge "$end" ]; then
      rm -f "$me"; trap - EXIT INT TERM
      echo "heavy-lock: TIMEOUT $(date +%T) after ${timeout}s; left the queue, the lock untouched" >&2
      return 2
    fi
    if [ $(( SECONDS - last_warn )) -ge 60 ]; then last_warn=$SECONDS; stale_report; fi
    sleep "$POLL"
  done
}

release() {
  local owner="${1:?usage: heavy-lock.sh release \"<owner line>\"}" held
  [ -d "$LOCK" ] || { echo "heavy-lock: not locked" >&2; return 1; }
  held=$(head -1 "$LOCK/owner.txt" 2>/dev/null)
  if [ "$held" != "$owner" ]; then
    echo "heavy-lock: NOT released: the lock is owned by: $held" >&2
    return 1
  fi
  rm -f "$LOCK/owner.txt" "$LOCK/holder" && rmdir "$LOCK" && echo "heavy-lock: released $(date +%T)" >&2
}

status() {
  local hp ht f n=0
  if [ -d "$LOCK" ]; then
    hp="?"; ht=""; [ -f "$LOCK/holder" ] && read -r hp ht < "$LOCK/holder"
    echo "owner: $(head -1 "$LOCK/owner.txt" 2>/dev/null || echo '(no owner.txt yet)')"
    if [ -n "$ht" ]; then echo "held: $(( ($(now) - ht) / 60 )) min (pid $hp $(alive "$hp" && echo running || echo gone))"; else echo "held: since unknown (taken without heavy-lock.sh)"; fi
    stale_report
  else
    echo "owner: (free)"
  fi
  [ -f "$DIR/geostrix-heavy.next" ] && echo "old .next slot (not used by this script): $(head -1 "$DIR/geostrix-heavy.next")"
  for f in $(queue_live); do n=$((n + 1)); echo "queue $n: $(head -1 "$QUEUE/$f") [$f]"; done
  [ "$n" -eq 0 ] && echo "queue: empty"
  return 0
}

case "${1:-}" in
  acquire) shift; acquire "$@" ;;
  release) shift; release "$@" ;;
  status) status ;;
  *) echo "usage: heavy-lock.sh acquire \"<owner line>\" [timeout_s] | release \"<owner line>\" | status" >&2; exit 64 ;;
esac
