# GeoStrix and antivirus false positives

On 2026-09-25 Bitdefender silently held the GeoStrix v0.1.20 installer: the setup window never appeared,
which looked like "it won't install". Releasing it from Bitdefender's quarantine fixed it. This page
records why this happens, what the build now does about it, and what still has to be done by hand.

**Since 0.1.53 every release is code-signed** (Certum, publisher *Open Source Developer Matheus Mendes de
Albuquerque* — see [CODE_SIGNING.md](../CODE_SIGNING.md)). A new certificate still has little SmartScreen
reputation, which builds up as people download and run signed releases, so the steps at the end of this page
can still be needed for a while.

## What actually blocks a fresh install (found 2026-09-25)

**Nothing in the installer broke between v0.1.14 and later versions.** What differs is how the file
reached the computer:

- A file **downloaded by a browser** gets Windows' "Mark of the Web" (a hidden `Zone.Identifier` tag).
  Windows **SmartScreen** then checks the publisher and reputation before letting it start. An unsigned
  file whose exact version it has never seen (every new release is a new file) is held there — and the
  antivirus (Bitdefender) scans it as an internet download at the same time. That is the "setup never
  opens" symptom.
- An **update installed from inside GeoStrix** is downloaded by the app itself, without the Mark of the
  Web, so neither check stops it. That is why "install an old version, then update from within the app"
  works.
- An older release you already allowed once (v0.1.14 here) is remembered, so it installs.

Proof, on this machine: the *same* installer file was blocked at launch when tagged as a download, and
opened its setup window in 8 seconds after the tag was removed with `Unblock-File`.

Code signing is the lasting fix (SmartScreen trusts a known publisher with a reputation). Releases are signed
from 0.1.53; until the certificate's reputation has built up, remove the tag yourself if a download is held —
see "Installing on a machine where antivirus blocks it" below.

## Why GeoStrix gets flagged

Antivirus products score an executable they have never seen before on how much it resembles malware.
GeoStrix had several traits that push that score up:

| Trait | Why it counts against us | Status |
|---|---|---|
| **Not code-signed** (installer, GeoStrix.exe, Python engine) | An unsigned file has no verified publisher and no reputation. This is the single biggest factor, and the reason Windows SmartScreen also warns. | **Fixed from 0.1.53 (TASKS.csv #777):** signed with a Certum Open Source certificate — see below. A new certificate's reputation still has to build up, so SmartScreen can warn for a while. |
| **PyInstaller's prebuilt bootloader** in the Python engine (`geostrix-sidecar.exe`) | The small launcher inside every PyInstaller program is byte-identical across countless malware samples that are also built with PyInstaller, so it is on many detection lists. | **Fixed (TASKS.csv #456):** the release build compiles the bootloader from source, so GeoStrix's engine has its own launcher. The build refuses to run in CI with the prebuilt one. |
| **No version information** on the Python engine | An executable with no company, product, description or version looks anonymous. | **Fixed:** it now carries the same identity as GeoStrix.exe (Matt Mendes, GeoStrix, version, MIT). |
| **PyInstaller's stock icon** | Another "generic packed program" signal. | **Fixed:** uses the GeoStrix icon. |
| **UPX packing** | UPX-compressed executables are a strong malware indicator. | **Guaranteed off:** the build passes `--noupx`. |
| **Self-extracting installer** (NSIS) | Installers unpack and write many files, which behavioural monitors (Bitdefender's Advanced Threat Control) watch closely. | **Mitigated:** every release now also ships a portable `.zip` that needs no installer. |

None of these fixes, signing included, *guarantees* that no antivirus will ever flag a new release — each
vendor uses its own heuristics and they change. They remove the most common triggers, and signing lets
reputation carry over from one release to the next.

## Code signing

Signing proves who published the file and lets reputation build up across releases. Options for an
open-source project like GeoStrix (MIT, public on GitHub):

1. **SignPath Foundation** — free code signing for qualifying open-source projects (signpath.org). Apply
   with the GitHub repository; signing then happens in CI.
2. **Certum "Open Source Code Signing"** certificate — low-cost (tens of euros a year) and issued to
   individual open-source developers after identity verification.
3. **Azure Trusted Signing** (Microsoft) — about US$10/month; requires identity validation.

**GeoStrix uses option 2** (TASKS.csv #777, from 0.1.53): a Certum Open Source certificate whose private
key lives in Certum's SimplySign cloud and is unlocked with the maintainer's phone, so GitHub's runner
cannot sign by itself. The Release workflow builds and tests on GitHub and uploads the unpacked app;
on the maintainer's PC, with SimplySign Desktop connected,

    git checkout v<version>
    powershell -ExecutionPolicy Bypass -File scripts\sign-release.ps1

signs GeoStrix.exe and the Python engine, packages the installer and zip from that same app, signs the
installer, its uninstaller and its elevation helper (timestamped by Certum), checks every signature,
regenerates `latest.yml` and `SHA256SUMS.txt` from the signed files and, after a confirmation, publishes.
`-DryRun` does everything except upload. If signing is ever unavailable, setting the repository variable
`PUBLISH_UNSIGNED` to `true` lets the workflow publish an unsigned build as before.

## Reporting a false positive

If a release is flagged anyway, report it — vendors usually whitelist within a day or two, and that
fixes it for every user of that product:

- **Bitdefender:** bitdefender.com → Support → "Submit a false positive" (upload the file or give the
  GitHub download link).
- **Microsoft Defender / SmartScreen:** microsoft.com/wdsi/filesubmission ("Software developer").

Each release lists SHA-256 checksums in `SHA256SUMS.txt` so a report can reference the exact file.

## Installing on a machine where antivirus blocks it

1. Download `GeoStrix-Setup-<version>.exe` from the GitHub release. Optional: check it against
   `SHA256SUMS.txt` (PowerShell: `Get-FileHash .\GeoStrix-Setup-<version>.exe`).
2. **Remove the download mark before running it** — right-click the file → Properties → tick
   **Unblock** at the bottom of the General tab → OK. (PowerShell alternative:
   `Unblock-File .\GeoStrix-Setup-<version>.exe`.) This is the step that makes a stuck installer open.
3. If Windows still shows "Windows protected your PC": **More info → Run anyway**. Releases from 0.1.53 are
   signed (the dialog names the publisher); older ones are unsigned.
4. If the installer does nothing, or disappears: open your antivirus (e.g. Bitdefender → Protection →
   Antivirus → Quarantine / Notifications), restore the file, and add an exception for it.
5. Alternative with no installer: download `GeoStrix-<version>-win.zip`, **Unblock the .zip first** (same
   Properties → Unblock; otherwise every extracted file inherits the download mark), extract it anywhere (e.g.
   `Documents\GeoStrix`), and run `GeoStrix.exe`. The first launch can take several seconds while the
   antivirus scans the new files. (The portable copy does not auto-update; use the installer for that.)
6. Also works: install any version that runs, then use Help → Check for Updates — in-app updates are not
   held by SmartScreen.
