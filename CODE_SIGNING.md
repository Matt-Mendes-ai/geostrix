# Code signing policy

This document describes how GeoStrix release binaries are built, signed and approved. It exists both
so that users can verify what they download, and because SignPath Foundation requires participating
projects to publish a code signing policy.

## Signing

Free code signing provided by [SignPath.io](https://signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

Signing applies to the Windows installer (`GeoStrix-Setup-<version>.exe`) and the executables it
contains. Releases published before signing was in place are unsigned — see *Release history* below.

## Team roles

GeoStrix is a single-maintainer project. There is no wider team, and this section will be updated if
that changes.

| Role | Person |
| --- | --- |
| Maintainer / project lead | Matt Mendes ([@Matt-Mendes-ai](https://github.com/Matt-Mendes-ai)) |
| Reviewer | Matt Mendes |
| Approver (authorises each signing request) | Matt Mendes |

## How releases are built

Releases are **not** built on a developer machine. Every published installer is produced by the
`Release` GitHub Actions workflow (`.github/workflows/release.yml`), which runs automatically when a
version tag (`v*`) is pushed, and which:

1. checks out the tagged commit,
2. freezes the Python sidecar with PyInstaller,
3. builds the web bundle,
4. packages the Electron app with `electron-builder`,
5. publishes the installer, its blockmap and `latest.yml` to the GitHub Release,
6. verifies the release is published (not a draft) and that `latest.yml`'s declared size matches the
   attached installer, failing the build if not.

Because the build runs from the tagged commit in a hosted runner, the binary is reproducible from
public source. Build scripts and CI configuration are part of the repository and are covered by the
same review as application code.

## Approval

Every signing request requires manual approval by an Approver listed above. Signing is not automatic
on tag push: a release is built and submitted, and a human authorises the signature.

## Verifying a download

Each release includes `latest.yml`, which carries the SHA-512 (base64) and byte size of the installer.
To check a download on Windows:

```powershell
# Compare against the sha512 value in latest.yml for that release
$bytes = [System.IO.File]::ReadAllBytes("GeoStrix-Setup-0.1.9.exe")
[Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash($bytes))
```

Once signing is active you can also check the signature directly:

```powershell
Get-AuthenticodeSignature "GeoStrix-Setup-0.1.9.exe" | Format-List Status, SignerCertificate
```

## SmartScreen

Microsoft Defender SmartScreen builds *reputation* per signing identity over time; it does not trust a
certificate instantly. Expect warnings on early signed releases, decreasing as consecutive releases
are signed with the same identity. Extended Validation (EV) certificates stopped bypassing SmartScreen
on first download in 2024, so EV would not avoid this either.

## Release history

| Versions | Signing status |
| --- | --- |
| 0.1.0 – 0.1.9 | Unsigned. Windows shows a SmartScreen warning; choose **More info** → **Run anyway**. |

This table will be updated when the first signed release ships.

## Privacy

See [PRIVACY.md](PRIVACY.md).
