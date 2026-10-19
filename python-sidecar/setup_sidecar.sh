#!/usr/bin/env bash
#
# GeoStrix Python sidecar setup for macOS / Linux — the counterpart of setup_sidecar.bat. TASKS.csv #772.
#
#   1. finds Python 3.11 (constraints.txt was verified on 3.11.9): $PYTHON if set, else python3.11 on PATH, else the
#      python.org / Homebrew install locations
#   2. creates python-sidecar/venv (reused if it exists)
#   3. installs the pinned dependencies, plus PyInstaller for scripts/build-macos.sh
#   4. checks the sidecar starts and answers /health
#   5. prints the GEOSTRIX_PYTHON line for `npm run dev` (it doesn't edit your shell profile)
#
# Not from a devbox/Nix Python: a frozen engine built from one links /nix/store libraries that a signed, hardened
# GeoStrix.app refuses to load (see scripts/build-macos.sh). Refused below.
#
# Usage: python-sidecar/setup_sidecar.sh

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

find_python() {
  if [[ -n "${PYTHON:-}" ]]; then echo "$PYTHON"; return; fi
  for p in python3.11 /opt/homebrew/bin/python3.11 /Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11 /usr/local/bin/python3.11; do
    if command -v "$p" >/dev/null 2>&1; then command -v "$p"; return; fi
  done
  return 1
}

if ! py="$(find_python)"; then
  echo "[X] Python 3.11 wasn't found. Install it (python.org, or: brew install python@3.11), or set PYTHON=/path/to/python3.11." >&2
  exit 1
fi
echo "[OK] Python: $py ($("$py" --version 2>&1))"
case "$("$py" -c 'import sys; print(sys.base_prefix)')" in
  /nix/store/*)
    echo "[X] That Python comes from Nix (devbox?). Use a python.org or Homebrew Python 3.11, outside the devbox shell." >&2
    exit 1 ;;
esac

if [[ ! -d venv ]]; then
  echo "Creating the virtual environment in python-sidecar/venv ..."
  "$py" -m venv venv
else
  echo "[OK] Virtual environment already exists, reusing it."
fi

echo "Installing dependencies (this pulls in gempy and SimPEG - may take a few minutes)..."
venv/bin/python -m pip install --upgrade pip >/dev/null
venv/bin/python -m pip install -r requirements.txt -c constraints.txt
venv/bin/python -m pip install pyinstaller -c constraints.txt
echo "[OK] Dependencies installed."

echo "Verifying the sidecar starts and responds..."
port=8799
venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$port" >/dev/null 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
ok=0
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$port/health" >/dev/null; then ok=1; break; fi
  sleep 1
done
if (( ok )); then echo "[OK] Sidecar responded: $(curl -s "http://127.0.0.1:$port/health")"
else echo "[X] The sidecar didn't respond on port $port. Run it by hand to see the error: venv/bin/python -m uvicorn app.main:app --port $port" >&2; exit 1
fi

echo
echo "Setup complete. To use it from 'npm run dev', set this in your shell first (or add it to your profile):"
echo "  export GEOSTRIX_PYTHON=\"$here/venv/bin/python\""
