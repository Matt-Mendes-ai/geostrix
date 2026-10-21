// geostrix.com — point the download buttons at the newest installer on GitHub Releases (TASKS.csv #597).
// Without JavaScript, or if GitHub's API can't be reached, the buttons keep their fallback: the latest-release page.
// The page's language (<html lang>) picks the wording: en, es, pt-BR, fr or ar.
const LANG = document.documentElement.lang || "en";
const TEXT = {
  en: { version: (v, mb) => `Version ${v} · Windows 10 / 11 (64-bit) · ${mb} MB`, downloads: (n) => `Downloaded ${n} times from GitHub (all versions, including updates).`, badge: (n) => `${n} downloads from GitHub` },
  es: { version: (v, mb) => `Versión ${v} · Windows 10 / 11 (64 bits) · ${mb} MB`, downloads: (n) => `Descargado ${n} veces desde GitHub (todas las versiones, incluidas las actualizaciones).`, badge: (n) => `${n} descargas desde GitHub` },
  pt: { version: (v, mb) => `Versão ${v} · Windows 10 / 11 (64 bits) · ${mb} MB`, downloads: (n) => `Baixado ${n} vezes do GitHub (todas as versões, incluindo atualizações).`, badge: (n) => `${n} downloads pelo GitHub` },
  fr: { version: (v, mb) => `Version ${v} · Windows 10 / 11 (64 bits) · ${mb} Mo`, downloads: (n) => `Téléchargé ${n} fois depuis GitHub (toutes versions, mises à jour comprises).`, badge: (n) => `${n} téléchargements sur GitHub` },
  ar: { version: (v, mb) => `الإصدار ${v} · Windows 10 / 11 (64 بت) · ${mb} ميغابايت`, downloads: (n) => `تم تنزيله ${n} مرة من GitHub (جميع الإصدارات، بما فيها التحديثات).`, badge: (n) => `${n} تنزيلًا من GitHub` },
};
const T = TEXT[LANG.slice(0, 2)] || TEXT.en;

(async () => {
  try {
    const r = await fetch("https://api.github.com/repos/Matt-Mendes-ai/geostrix/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return;
    const rel = await r.json();
    const exe = (rel.assets || []).find((a) => /^GeoStrix-Setup-.*\.exe$/.test(a.name));
    if (!exe) return;
    const mb = Math.round(exe.size / 1e6);
    document.querySelectorAll("[data-download]").forEach((a) => { a.href = exe.browser_download_url; });
    document.querySelectorAll("[data-version]").forEach((el) => {
      el.textContent = T.version(rel.tag_name.replace(/^v/, ""), mb);
    });
  } catch { /* keep the fallback link */ }
})();

// Download count: every GeoStrix installer and portable zip ever downloaded from GitHub Releases, all versions.
// Counts only the app itself (not latest.yml, blockmaps, checksums or the geoML add-on). GitHub counts each
// download of the installer, so updates installed from inside GeoStrix are included. Shown twice: the badge above the
// headline (number + "downloads", linked to the releases so anyone can check it) and the full sentence by the Download
// button, which says updates are included. Both stay hidden if GitHub can't be reached.
(async () => {
  try {
    const line = document.querySelector("[data-downloads]");
    const badge = document.querySelector("[data-downloads-badge]");
    if (!line && !badge) return;
    let total = 0;
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(`https://api.github.com/repos/Matt-Mendes-ai/geostrix/releases?per_page=100&page=${page}`, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) return;
      const releases = await r.json();
      for (const rel of releases) {
        for (const a of rel.assets || []) {
          if (/^GeoStrix-Setup-.*\.exe$/.test(a.name) || /^GeoStrix-.*-win\.zip$/.test(a.name)) total += a.download_count || 0;
        }
      }
      if (releases.length < 100) break;
    }
    if (!total) return;
    // Arabic pages keep Western digits (409, not ٤٠٩), as most Arabic tech and mining sites in North Africa do
    const n = total.toLocaleString(LANG === "en" ? "en-CA" : LANG === "ar" ? "ar-u-nu-latn" : LANG);
    if (line) { line.textContent = T.downloads(n); line.hidden = false; }
    if (badge) { badge.querySelector("[data-n]").textContent = T.badge(n); badge.classList.add("ready"); }
  } catch { /* leave the count hidden */ }
})();
