# GeoStrix on macOS (Apple Silicon)

ExploreTech's build of GeoStrix for Apple Silicon Macs (TASKS.csv #772–#775). GeoStrix is by Matt Mendes (MIT
licence, `LICENSE`): the app's About box, its copyright notice and `package.json`'s author still credit him. The
macOS bundle ID is `ai.exploretech.geostrix`, and builds are signed with ExploreTech's Developer ID.

## Run from source

```bash
npm install
python-sidecar/setup_sidecar.sh                     # optional: the Python engine (GemPy, SimPEG)
export GEOSTRIX_PYTHON="$PWD/python-sidecar/venv/bin/python"
npm run dev
```

`setup_sidecar.sh` needs Python 3.11 from python.org or Homebrew (`brew install python@3.11`), not a devbox/Nix one
(see *Why not Nix* below).

## Build a signed, notarized DMG

On an Apple Silicon Mac with:

- the **Developer ID Application: Exploration Technologies, Inc (CK8MVY2C3J)** certificate in the login keychain,
- the Apple ID app-specific password in the keychain item the Tauri apps use (service `AppleID`, account
  `tauri-signing`), and
- `python-sidecar/venv` from `setup_sidecar.sh`,

run:

```bash
scripts/build-macos.sh
```

It freezes the Python engine, checks it links nothing from outside the bundle, builds the renderer, then packages,
signs and notarizes with electron-builder (`package.json` `build.mac`, `build/entitlements.mac.plist`). It then checks
the signature, Gatekeeper and the staple, starts the signed app (`scripts/smoke-electron.mjs`), and runs a real
inversion job against the signed Python engine (`python-sidecar/tests/test_jobs_api.py`). The output is
`release/GeoStrix-<version>-arm64.dmg`. Set `APPLE_ID` to notarize with another Apple ID.

The pattern is the same as `et-engine-file-viewer/scripts/build-macos.sh`. There are two differences: electron-builder
reads the app-specific password as `APPLE_APP_SPECIFIC_PASSWORD` (Tauri calls it `APPLE_PASSWORD`), and there is no
updater signing key (see below).

### Why not Nix

The frozen Python engine copies its libraries into the app, and electron-builder re-signs each one with ExploreTech's
Team ID. A library still loaded from `/nix/store` is signed outside that Team ID, so the hardened runtime refuses to
load it ("different Team IDs"). That is the same failure `et-engine-file-viewer/scripts/macos-link.sh` works around
for libiconv. A library loaded from Homebrew's prefix would not exist on another Mac at all. `build-macos.sh` checks
for both.

### Entitlements

`build/entitlements.mac.plist` applies to the app and, as `entitlementsInherit`, to every executable inside it:
`allow-jit` for V8, and `allow-unsigned-executable-memory` for Numba/llvmlite, which compile SimPEG's kernels at run
time. There is no sandbox, and no `disable-library-validation`.

## What differs from the Windows build

- **Menus.** There's a GeoStrix app menu (About, Services, Hide, Quit ⌘Q). The Edit menu has Cut/Copy/Paste/Select
  All, which a Mac text field needs before ⌘C/⌘V work. File ends with Close Window (⌘W). There's a Window menu and
  View › Enter Full Screen. Built in `electron/menuTemplate.js`; Windows/Linux keep their menu unchanged.
- **Undo.** ⌘Z/⇧⌘Z belong to the Edit menu. A focused text field gets its own text undo; anywhere else they step
  back through project changes, as on Windows.
- **Labels.** Shortcuts show as ⌘S, ⇧⌘S, ⌘-click (`src/lib/platform.js`).
- **Closing the window** leaves GeoStrix in the Dock, and the unsaved-changes dialog says "Close", not "Quit".
- **Updates are off** (#774): there's no Mac update feed yet, so there are no update menu items and no startup
  check. To install a new version, install the new DMG.
- **The geoML add-on** is Windows-only so far; its panel says so instead of offering a download.
- **The Browser panel** lists `/`, your home folder and each mounted volume under `/Volumes`.
