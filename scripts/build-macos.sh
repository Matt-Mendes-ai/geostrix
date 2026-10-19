#!/usr/bin/env bash
#
# Build, sign and notarize GeoStrix for macOS (Apple Silicon only), on a Mac. TASKS.csv #772.
#
# Signing follows ExploreTech's Tauri apps (et-engine-file-viewer/scripts/build-macos.sh):
#   * the "Developer ID Application: Exploration Technologies, Inc (CK8MVY2C3J)" certificate in the login keychain
#     (package.json build.mac.identity), hardened runtime, build/entitlements.mac.plist;
#   * notarization with the Apple ID's app-specific password, read from the same keychain item the Tauri build uses
#     (service "AppleID", account "tauri-signing"). electron-builder reads it as APPLE_APP_SPECIFIC_PASSWORD; Tauri's
#     name for the same value is APPLE_PASSWORD.
# Unlike Tauri there is no updater signing key: auto-update is off on macOS for now (TASKS.csv #774).
#
# The Python engine is frozen from python-sidecar/venv (python-sidecar/setup_sidecar.sh). Build that venv from a
# python.org or Homebrew Python 3.11, NOT a devbox/Nix one: this is the same failure the Tauri script works around
# with macos-link.sh. A library loaded from /nix/store is signed outside our Team ID, and the hardened runtime
# refuses to load it ("mapping process and mapped file (non-platform) have different Team IDs"). Checked below,
# along with Homebrew paths, which would also be missing on any other Mac.
#
# Usage: scripts/build-macos.sh   (from the repo root, on an Apple Silicon Mac; ~10 min, most of it notarization)
# Output: release/GeoStrix-<version>-arm64.dmg

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo "!! Run this on an Apple Silicon Mac (this build is arm64 only)." >&2
  exit 1
fi

IDENTITY="Developer ID Application: Exploration Technologies, Inc (CK8MVY2C3J)"
TEAM_ID="CK8MVY2C3J"
VENV_PY="python-sidecar/venv/bin/python"
APP="release/mac-arm64/GeoStrix.app"
SIDECAR="$APP/Contents/Resources/python-sidecar/geostrix-sidecar/geostrix-sidecar"

echo "==> Checking the signing identity"
if ! security find-identity -v -p codesigning | grep -qF "$IDENTITY"; then
  echo "!! \"$IDENTITY\" is not in the keychain." >&2
  exit 1
fi

echo "==> Loading notarization credentials"
export APPLE_ID="${APPLE_ID:-kai.wells@exploretech.ai}"
export APPLE_TEAM_ID="$TEAM_ID"
APPLE_APP_SPECIFIC_PASSWORD="$(security find-generic-password -s "AppleID" -a "tauri-signing" -w)"
export APPLE_APP_SPECIFIC_PASSWORD

echo "==> Checking the Python engine's venv"
if [[ ! -x "$VENV_PY" ]]; then
  echo "!! No $VENV_PY. Run python-sidecar/setup_sidecar.sh first." >&2
  exit 1
fi
base_prefix="$("$VENV_PY" -c 'import sys; print(sys.base_prefix)')"
if [[ "$base_prefix" == /nix/store/* ]]; then
  echo "!! python-sidecar/venv was made from a Nix Python ($base_prefix). Recreate it from python.org or Homebrew" >&2
  echo "   Python 3.11 outside the devbox shell (see the header of this script for why)." >&2
  exit 1
fi
if ! "$VENV_PY" -c 'import PyInstaller' 2>/dev/null; then
  echo "!! PyInstaller isn't installed in python-sidecar/venv (setup_sidecar.sh installs it)." >&2
  exit 1
fi

echo "==> Freezing the Python engine"
rm -rf python-sidecar/dist/geostrix-sidecar
npm run build:sidecar

echo "==> Checking the frozen engine only links its own copies and the system's"
bad=0
while IFS= read -r -d '' f; do
  file -b "$f" | grep -q Mach-O || continue
  refs="$(otool -L "$f" 2>/dev/null | tail -n +2 | awk '{print $1}' | grep -E '^/(nix/store|opt/homebrew|usr/local)/' || true)"
  if [[ -n "$refs" ]]; then
    echo "!! $f links outside the bundle:" >&2
    echo "$refs" | sed 's/^/     /' >&2
    bad=1
  fi
done < <(find python-sidecar/dist/geostrix-sidecar -type f -print0)
if (( bad )); then
  echo "   Those libraries would be missing on another Mac, or refused by the hardened runtime." >&2
  exit 1
fi
echo "    clean"

# electron-builder overwrites same-named outputs but never purges them, so an older version's DMG would linger.
echo "==> Cleaning stale output"
rm -rf release/mac-arm64 release/*.dmg release/*.dmg.blockmap

echo "==> Building the renderer"
npx vite build

echo "==> Packaging + signing + notarizing (electron-builder)"
npx electron-builder --mac --arm64 --publish never

echo "==> Verifying the signed bundle"
codesign --verify --deep --strict --verbose=2 "$APP"
if ! codesign -dv "$SIDECAR" 2>&1 | grep -q "TeamIdentifier=$TEAM_ID"; then
  echo "!! The Python engine inside the app isn't signed with Team ID $TEAM_ID." >&2
  exit 1
fi
if ! codesign -d --entitlements - "$SIDECAR" 2>/dev/null | grep -q allow-unsigned-executable-memory; then
  echo "!! The Python engine is missing its JIT entitlement (build/entitlements.mac.plist via entitlementsInherit)." >&2
  exit 1
fi
spctl -a -vvv -t exec "$APP"
xcrun stapler validate "$APP"

echo "==> Smoke test: the signed app starts and renders"
node scripts/smoke-electron.mjs "$APP/Contents/MacOS/GeoStrix"

# The signed engine run directly, as GeoStrix runs it: a real SimPEG job compiles Numba kernels, which is exactly what
# the hardened runtime would stop if the JIT entitlement were wrong. The frozen engine always listens on 8765.
echo "==> Smoke test: the signed Python engine runs an inversion job"
if lsof -nP -iTCP:8765 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "!! Something is already listening on port 8765 (a running GeoStrix?). Quit it and re-run." >&2
  exit 1
fi
token="smoke-$RANDOM$RANDOM"
GEOSTRIX_SIDECAR_TOKEN="$token" "$SIDECAR" >/tmp/geostrix-sidecar-smoke.log 2>&1 &
sidecar_pid=$!
trap 'kill "$sidecar_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:8765/health >/dev/null && break
  sleep 1
done
(cd python-sidecar && venv/bin/python tests/test_jobs_api.py 8765 "$token")

dmg=(release/GeoStrix-*-arm64.dmg)
echo "==> Done."
echo "    App: $APP"
echo "    DMG: ${dmg[0]}"
