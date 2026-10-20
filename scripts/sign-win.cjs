// TASKS.csv #777 — electron-builder's custom Windows sign hook for the Certum certificate in SimplySign.
// Used ONLY by scripts/sign-release.ps1 (passed as win.signtoolOptions.sign), so a plain build stays unsigned.
// The private key never leaves SimplySign: signtool hands the file's hash to the SimplySign CSP, which signs it
// in Certum's cloud; the RFC 3161 timestamp keeps the signature valid after the certificate expires.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function signtool() {
  const root = path.join(process.env["ProgramFiles(x86)"] || "C:\Program Files (x86)", "Windows Kits", "10", "bin");
  const versions = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^10\./.test(d)).sort() : [];
  for (const v of versions.reverse()) {
    const p = path.join(root, v, "x64", "signtool.exe");
    if (fs.existsSync(p)) return p;
  }
  throw new Error("signtool.exe not found: install the Windows 10/11 SDK signing tools.");
}

// Already signed with this certificate (scripts/sign-release.ps1 pre-signs, or electron-builder asks twice)?
function signedBy(file, sha1) {
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", `$s = Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'; if ($s.Status -eq 'Valid') { $s.SignerCertificate.Thumbprint }`], { encoding: "utf8" });
    return out.trim().toUpperCase() === sha1;
  } catch { return false; }
}

exports.default = async function sign(configuration) {
  const sha1 = (process.env.GEOSTRIX_SIGN_SHA1 || "").replace(/\s/g, "").toUpperCase();
  if (!/^[0-9A-F]{40}$/.test(sha1)) throw new Error("GEOSTRIX_SIGN_SHA1 must be the certificate's SHA-1 thumbprint (set by scripts/sign-release.ps1).");
  const file = configuration.path;
  if (signedBy(file, sha1)) { console.log(`  already signed: ${path.basename(file)}`); return; }
  execFileSync(signtool(), ["sign", "/sha1", sha1, "/fd", "sha256", "/tr", "http://time.certum.pl", "/td", "sha256", "/d", "GeoStrix", "/du", "https://geostrix.com", file], { stdio: "inherit" });
  console.log(`  signed: ${path.basename(file)}`);
};
