<#
TASKS.csv #777 — sign and publish a GeoStrix release with the Certum certificate held in SimplySign.

The Release workflow builds and tests everything on GitHub's runner from the tagged commit, then stops: it
uploads the unpacked app ("unpacked-app") and does NOT publish. This script, run on the maintainer's PC with
SimplySign Desktop connected:
  1. waits for that run and downloads the unpacked app (curl, resuming after every stall or drop - #812; if even
     that cannot finish, it shows the browser link and waits for the zip in Downloads),
  2. signs GeoStrix.exe and the Python engine's executables,
  3. packages the installer and zip from that same app (electron-builder --prepackaged) and signs the
     installer, its uninstaller and its elevation helper (scripts/sign-win.cjs),
  4. checks every signature, writes SHA256SUMS.txt (latest.yml is written by electron-builder from the
     SIGNED installer, so the auto-updater's checksum matches what users download),
  5. after you confirm, creates the GitHub release, uploads (latest.yml last), publishes and verifies it.

Usage (from the repository root, at the tagged commit):
  powershell -ExecutionPolicy Bypass -File scripts\sign-release.ps1              # tag = v<package.json version>
  powershell -ExecutionPolicy Bypass -File scripts\sign-release.ps1 -Tag v0.1.53
  ... -DryRun                       # sign and package, but do not touch GitHub
  ... -Yes                          # publish without asking (every check above still has to pass first)
  ... -UnpackedDir release\win-unpacked -DryRun   # test with a local build instead of the CI artifact

The private key never leaves SimplySign; this script never sees a password or one-time code.
#>
param(
  [string]$Tag = "",
  [string]$Thumbprint = "",
  [string]$UnpackedDir = "",
  [switch]$DryRun,
  [switch]$Yes  # TASKS.csv #780 — publish without the y/N prompt: "release" in chat is the go-ahead
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$repo = "Matt-Mendes-ai/geostrix"

# Windows PowerShell 5.1 with ErrorActionPreference Stop turns ANY stderr line of a native command into a fatal
# error - including "release not found" from a probe that is expected to fail (#778: the v0.1.53 run stopped there).
# Probes go through this.
function Probe([scriptblock]$cmd) {
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try { $out = & $cmd 2>$null; return @{ ok = ($LASTEXITCODE -eq 0); out = $out } } finally { $ErrorActionPreference = $old }
}
function Fail($msg) { Write-Host ""; Write-Host "STOPPED: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }

# ---- version and tag: the installer's version comes from THIS checkout's package.json, so it must be the tag's
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
if (-not $Tag) { $Tag = "v$version" }
if ($Tag -ne "v$version") { Fail "package.json says $version but the tag is $Tag. Check out the tagged commit first (git checkout $Tag)." }
if (-not $UnpackedDir) {
  git rev-parse -q --verify "refs/tags/$Tag" | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "Tag $Tag does not exist locally (git fetch --tags)." }
  git diff --quiet $Tag -- package.json scripts/sign-win.cjs build
  if ($LASTEXITCODE -ne 0) { Fail "package.json, scripts/sign-win.cjs or build/ differ from $Tag. Run this at the tagged commit so the installer matches the release." }
}

# TASKS.csv #778 — fetch the CI's unpacked app: gh first, then the browser. On the maintainer's PC `gh run download`
# stalled twice for v0.1.53 (froze at 155 MB; then 0 bytes for minutes) while a browser download of the same
# artifact worked, so after a time limit the script prints the artifact's page and waits for the zip in Downloads,
# accepting it only at exactly the size GitHub reports.
# TASKS.csv #988 — the zip is the app the private key will sign, so it is checked against the SHA-256 digest GitHub
# records for the artifact (upload-artifact v4.6+; download-artifact checks the same field), not by its size alone:
# a different file of the same size in Downloads, or a corrupted download, is refused. An artifact without a digest
# (an older upload) is accepted by size, with a warning.
function Assert-ArtifactDigest($path, $a) {
  if ("$($a.digest)" -match '^sha256:([0-9a-fA-F]{64})$') {
    $want = $Matches[1].ToLower()
    $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLower()
    if ($got -ne $want) { Fail "$(Split-Path $path -Leaf) does not match the artifact GitHub built (SHA-256 $got, expected $want). It was not unpacked or signed. Delete it and run this again." }
    Write-Host "  SHA-256 matches the artifact's digest"
  } else {
    Write-Host "  GitHub reports no digest for this artifact: accepted by size only" -ForegroundColor Yellow
  }
}

function Get-UnpackedApp($runId, $dest, $repo, [int]$ghMinutes = 15, [int]$browserMinutes = 60) {
  $art = (Probe { gh api "repos/$repo/actions/runs/$runId/artifacts" }).out | Out-String | ConvertFrom-Json
  $a = $art.artifacts | Where-Object { $_.name -eq "unpacked-app" } | Select-Object -First 1
  if (-not $a) { Fail "Build $runId has no unpacked-app artifact." }
  if ($a.expired) { Fail "The unpacked-app artifact of build $runId has expired (kept 7 days): re-run the Release workflow." }
  # TASKS.csv #812 — "ur download almost always fails": gh run download is one stream with no resume, so a stall
  # meant waiting out the time limit and then the browser. Now curl fetches the zip and, when it stalls (under
  # 20 kB/s for 45 s) or drops, resumes from the bytes it already has, with a fresh storage link each try (GitHub's
  # artifact links last about a minute). The GitHub CLI's token goes to curl through a temporary header file, deleted
  # afterwards - never on the command line or the screen.
  $zipPath = Join-Path (Split-Path $dest) "unpacked-app.zip"
  $hdrFile = Join-Path (Split-Path $dest) "gh-auth-header.txt"
  $token = ((Probe { gh auth token }).out | Out-String).Trim()
  if ($token) {
    # TASKS.csv #988 — the header file is readable by this user only (no inherited access), set before the token is in it
    New-Item -ItemType File -Path $hdrFile -Force | Out-Null
    & icacls.exe $hdrFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
    Set-Content -Path $hdrFile -Value "Authorization: Bearer $token" -Encoding ascii -NoNewline
    $token = $null
    $deadline = (Get-Date).AddMinutes($ghMinutes * 3)
    $api = "https://api.github.com/repos/$repo/actions/artifacts/$($a.id)/zip"
    try {
      for ($try = 1; (Get-Date) -lt $deadline; $try++) {
        $have = 0
        if (Test-Path $zipPath) { $have = (Get-Item $zipPath).Length }
        if ($have -eq $a.size_in_bytes) { break }
        if ($have -gt $a.size_in_bytes) { Remove-Item $zipPath -Force; $have = 0 }
        $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        $head = & curl.exe -s -o NUL -D - --connect-timeout 30 -H "@$hdrFile" -H "Accept: application/vnd.github+json" $api 2>$null
        # TASKS.csv #1133 — an empty or redirect-less reply (a dropped connection) is one failed try, not a crash: indexing
        # .Matches.Groups of no match threw "Cannot index into a null array" and ended the resume loop at 121 of 325 MB
        $m = $head | Select-String -Pattern '(?i)^location:\s*(\S+)' | Select-Object -First 1
        $loc = if ($m) { $m.Matches[0].Groups[1].Value } else { $null }
        if ($loc) { & curl.exe -s -f -C - --connect-timeout 30 --speed-limit 20000 --speed-time 45 -o $zipPath $loc 2>$null }
        else { Write-Host "  no download link from GitHub this time (connection dropped?) - retrying" }
        $ErrorActionPreference = $old
        $now = 0
        if (Test-Path $zipPath) { $now = (Get-Item $zipPath).Length }
        Write-Host ("  try {0}: {1:N0} of {2:N0} bytes" -f $try, $now, $a.size_in_bytes)
        if ($now -lt $a.size_in_bytes) { Start-Sleep -Seconds 5 }
      }
    } finally { Remove-Item $hdrFile -Force -ErrorAction SilentlyContinue }
    if ((Test-Path $zipPath) -and (Get-Item $zipPath).Length -eq $a.size_in_bytes) {
      Assert-ArtifactDigest $zipPath $a
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      try { [IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $dest) } catch { Write-Host "  the zip did not unpack: $($_.Exception.Message)" }
      if (Test-Path (Join-Path $dest "GeoStrix.exe")) { Remove-Item $zipPath -Force; Write-Host "  downloaded (resumable)"; return }
    }
  }
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }
  $page = "https://github.com/$repo/actions/runs/$runId/artifacts/$($a.id)"
  Write-Host ""
  Write-Host "The download did not complete in $($ghMinutes * 3) minutes, even resuming. Download it in your browser instead (signed in to GitHub):" -ForegroundColor Yellow
  Write-Host "  $page" -ForegroundColor Yellow
  Write-Host "  and leave unpacked-app.zip ($('{0:N0}' -f $a.size_in_bytes) bytes) in your Downloads folder - this script waits for it."
  $dl = Join-Path $env:USERPROFILE "Downloads"
  $deadline = (Get-Date).AddMinutes($browserMinutes)
  $zip = $null
  while ((Get-Date) -lt $deadline) {
    $zip = Get-ChildItem $dl -Filter "unpacked-app*.zip" -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -eq $a.size_in_bytes } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($zip) { break }
    Start-Sleep -Seconds 10
  }
  if (-not $zip) { Fail "No unpacked-app.zip of $('{0:N0}' -f $a.size_in_bytes) bytes appeared in $dl within $browserMinutes minutes." }
  Start-Sleep -Seconds 3  # let the browser finish closing the file
  Assert-ArtifactDigest $zip.FullName $a
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($zip.FullName, $dest)
  Write-Host "  unpacked $($zip.Name) from Downloads ($('{0:N0}' -f $zip.Length) bytes, the artifact GitHub built)"
}

# ---- the certificate (SimplySign Desktop must be connected for its private key to appear)
Step "Certificate"
$certs = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.HasPrivateKey -and $_.Issuer -like "*Certum Code Signing*" -and $_.NotAfter -gt (Get-Date) }
if ($Thumbprint) { $certs = $certs | Where-Object { $_.Thumbprint -eq $Thumbprint.ToUpper() } }
$cert = $certs | Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) { Fail "No Certum code-signing certificate with its private key. Open SimplySign Desktop, log in with the mobile app's code, and run this again." }
Write-Host "Signing as: $($cert.Subject)"
Write-Host "Thumbprint: $($cert.Thumbprint), valid to $($cert.NotAfter.ToString('yyyy-MM-dd'))"
$env:GEOSTRIX_SIGN_SHA1 = $cert.Thumbprint

$sdk = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
$signtool = Get-ChildItem $sdk -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match "\\x64\\" } | Sort-Object FullName | Select-Object -Last 1
if (-not $signtool) { Fail "signtool.exe not found: install the Windows SDK's signing tools." }

function Sign-File($path) {
  $s = Get-AuthenticodeSignature -LiteralPath $path
  if ($s.Status -eq "Valid" -and $s.SignerCertificate.Thumbprint -eq $cert.Thumbprint) { Write-Host "  already signed: $path"; return }
  & $signtool.FullName sign /sha1 $cert.Thumbprint /fd sha256 /tr http://time.certum.pl /td sha256 /d GeoStrix /du https://geostrix.com $path | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "signtool failed on $path (is SimplySign still connected?)" }
  Write-Host "  signed: $path"
}
function Assert-Signed($path) {
  $s = Get-AuthenticodeSignature -LiteralPath $path
  if ($s.Status -ne "Valid" -or $s.SignerCertificate.Thumbprint -ne $cert.Thumbprint -or -not $s.TimeStamperCertificate) {
    Fail "$path is not validly signed and timestamped with this certificate ($($s.Status): $($s.StatusMessage))"
  }
}

$work = Join-Path $env:TEMP "geostrix-sign\$Tag"
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force $work | Out-Null
$app = Join-Path $work "win-unpacked"

# ---- the app GitHub built (or a local one for a dry run)
if ($UnpackedDir) {
  Step "Using the local app in $UnpackedDir (test only)"
  if (-not $DryRun) { Fail "-UnpackedDir is for testing: add -DryRun. Published releases are built by GitHub." }
  Copy-Item (Resolve-Path $UnpackedDir) $app -Recurse
} else {
  Step "Waiting for GitHub's Release build of $Tag"
  if (-not (Probe { gh auth status }).ok) { Fail "The GitHub CLI is not logged in (gh auth login)." }
  $probe = Probe { gh release view $Tag --repo $repo --json isDraft }
  if ($probe.ok -and -not (($probe.out | Out-String) | ConvertFrom-Json).isDraft) { Fail "$Tag is already published on GitHub. Nothing to do." }
  $run = $null
  for ($i = 0; $i -lt 120; $i++) {
    $runs = gh run list --repo $repo --workflow release.yml --limit 30 --json databaseId,headBranch,event,status,conclusion | ConvertFrom-Json
    $run = $runs | Where-Object { $_.headBranch -eq $Tag -and $_.event -eq "push" } | Select-Object -First 1
    if ($run -and $run.status -eq "completed") { break }
    $state = "not started yet"
    if ($run) { $state = $run.status }
    Write-Host "  build $state - checking again in 30 s"
    Start-Sleep -Seconds 30
  }
  if (-not $run -or $run.status -ne "completed") { Fail "The Release build of $Tag did not finish within an hour." }
  if ($run.conclusion -ne "success") { Fail "The Release build of $Tag ended '$($run.conclusion)' - see https://github.com/$repo/actions/runs/$($run.databaseId). Not signing a build that failed its tests." }
  Write-Host "Build $($run.databaseId) succeeded; downloading the unpacked app"
  Get-UnpackedApp $run.databaseId $app $repo
}
$exe = Join-Path $app "GeoStrix.exe"
if (-not (Test-Path $exe)) { Fail "The app has no GeoStrix.exe." }
$appVersion = (Get-Item $exe).VersionInfo.ProductVersion
if ($appVersion -notlike "$version*") { Fail "GeoStrix.exe is version $appVersion, expected $version." }

# ---- sign what is inside, then package and sign the installer
Step "Signing GeoStrix.exe and the Python engine"
Sign-File $exe
$engine = @(Get-ChildItem (Join-Path $app "resources\python-sidecar") -Recurse -Filter *.exe)
if ($engine.Count -eq 0) { Fail "The app has no Python engine executable." }
foreach ($f in $engine) { Sign-File $f.FullName }

Step "Packaging and signing the installer and zip"
$out = Join-Path $work "out"
npx electron-builder --prepackaged $app --win nsis zip --publish never "-c.win.signtoolOptions.sign=./scripts/sign-win.cjs" "-c.directories.output=$out"
if ($LASTEXITCODE -ne 0) { Fail "electron-builder failed." }

Step "Checking signatures and collecting the release files"
$files = Join-Path $work "release-files"
New-Item -ItemType Directory -Force $files | Out-Null
Get-ChildItem $out -File | Where-Object { ($_.Name -like "GeoStrix*" -and $_.Name -match "\.(exe|zip|blockmap)$") -or $_.Name -eq "latest.yml" } | ForEach-Object { Copy-Item $_.FullName (Join-Path $files ($_.Name -replace " ", "-")) }
$installer = Get-ChildItem $files -Filter "GeoStrix-Setup-$version.exe" | Select-Object -First 1
if (-not $installer) { Fail "No installer was built." }
foreach ($required in @("GeoStrix-Setup-$version.exe.blockmap", "latest.yml", "GeoStrix-$version-win.zip")) {
  if (-not (Test-Path (Join-Path $files $required))) { Fail "Missing $required." }
}
Assert-Signed $exe
foreach ($f in $engine) { Assert-Signed $f.FullName }
Assert-Signed $installer.FullName
$latest = Get-Content (Join-Path $files "latest.yml") -Raw
$declared = [regex]::Match($latest, "size:\s*(\d+)").Groups[1].Value
$sha = [Convert]::ToBase64String([Security.Cryptography.SHA512]::Create().ComputeHash([IO.File]::ReadAllBytes($installer.FullName)))
if ($declared -ne [string]$installer.Length -or $latest -notmatch [regex]::Escape($sha)) { Fail "latest.yml does not describe the signed installer - the auto-updater would reject it." }
$sums = Get-ChildItem $files -File | Where-Object { $_.Name -match "\.(exe|zip)$" } | ForEach-Object { "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)" }
$sums | Set-Content -Path (Join-Path $files "SHA256SUMS.txt") -Encoding ascii
Get-ChildItem $files | ForEach-Object { Write-Host ("  {0,12:N0}  {1}" -f $_.Length, $_.Name) }
Write-Host "All signatures valid and timestamped; latest.yml matches the signed installer."

if ($DryRun) { Write-Host ""; Write-Host "Dry run: nothing was uploaded. Files are in $files" -ForegroundColor Green; exit 0 }

# ---- publish
Step "Publish $Tag"
if ($Yes) {
  Write-Host "Publishing without asking (-Yes): every signature and latest.yml check above passed."
} else {
  $answer = Read-Host "Upload these files and publish $Tag on GitHub now? (y/N)"
  if ($answer -ne "y") { Write-Host "Not published. Files are in $files"; exit 0 }
}
$notes = "Download **GeoStrix-Setup-$version.exe** below (Windows 10 / 11, 64-bit), or the portable **GeoStrix-$version-win.zip**. Signed by Open Source Developer Matheus Mendes de Albuquerque (Certum). Checksums: SHA256SUMS.txt.`n`n[Code signing policy](https://github.com/$repo/blob/master/CODE_SIGNING.md) · [Privacy policy](https://geostrix.com/privacy) · [geostrix.com](https://geostrix.com)"
if (-not (Probe { gh release view $Tag --repo $repo }).ok) {
  gh release create $Tag --repo $repo --title $Tag --notes $notes --draft --verify-tag
  if ($LASTEXITCODE -ne 0) { Fail "Could not create the release." }
}
$upload = Get-ChildItem $files -File | Where-Object { $_.Name -ne "latest.yml" } | ForEach-Object { $_.FullName }
gh release upload $Tag $upload --repo $repo --clobber
if ($LASTEXITCODE -ne 0) { Fail "Upload failed; the release is still a draft." }
gh release upload $Tag (Join-Path $files "latest.yml") --repo $repo --clobber  # last: the updater must find the installer it names
if ($LASTEXITCODE -ne 0) { Fail "Uploading latest.yml failed; the release is still a draft." }
gh release edit $Tag --repo $repo --draft=false --latest
if ($LASTEXITCODE -ne 0) { Fail "Could not publish the draft." }

$check = gh release view $Tag --repo $repo --json isDraft,assets | ConvertFrom-Json
$attached = ($check.assets | Where-Object { $_.name -eq $installer.Name }).size
if ($check.isDraft -or $attached -ne $installer.Length -or -not ($check.assets | Where-Object { $_.name -eq "latest.yml" })) { Fail "The published release does not look complete - check https://github.com/$repo/releases/tag/$Tag" }
Write-Host ""
Write-Host "Published https://github.com/$repo/releases/tag/$Tag (signed)." -ForegroundColor Green
