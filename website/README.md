# geostrix.com

The GeoStrix website: plain HTML + CSS, no build step, no framework, no cookies, no tracking (TASKS.csv #597).

- `index.html` — home, features, screenshots, download, support
- `privacy.html` — privacy policy (keep in step with `../PRIVACY.md`)
- `contact.html` + `contact.js` — the contact form, which posts to `/api/contact` (`../worker/contact.js`, see "Contact form" below)
- `es/`, `pt-br/`, `fr/` and `ar/` — the same two pages in Spanish (Latin American), Brazilian Portuguese, French
  and Arabic. **Any change to `index.html` or `privacy.html` needs the same change in all four translations.** Each
  page links its other languages (`hreflang` in `<head>`, the EN · ES · PT · FR · AR switcher in the header, and
  `sitemap.xml`) and uses root-absolute paths (`/style.css`, `/img/…`) so the subfolders share one set of files.
  The translated privacy pages say the English one prevails.
  - The app itself is in all five languages (Spanish and Portuguese TASKS.csv #786, French and Arabic #788, from
    0.1.57): each translated page uses the app's own menu names in its language, from `src/locales/*.json` and
    `electron/main.js` `MENU_TR`.
  - Arabic (`<html lang="ar" dir="rtl">`): `style.css` uses inline-start/end (logical) properties, so the layout
    mirrors by itself — keep using them, not left/right. Arabic text uses the system's Arabic fonts (Exo 2 has
    none). English fragments inside Arabic text get `dir="ltr"` / `<bdi>` so their arrows and order stay right.
- `download.js` — points the download buttons at the newest `GeoStrix-Setup-*.exe` on GitHub Releases
  (falls back to the latest-release page without JavaScript or if GitHub's API is unreachable), and shows the
  total GitHub download count of the installer + portable zip: as a badge above the home page's headline (linked
  to the releases, space reserved so nothing jumps) and as a full sentence by the Download button. Its text, and `gallery.js`'s button labels,
  follow the page's `<html lang>`
- `img/` — screenshots from the bundled Harry sample project (ARIS report 37584), WebP; the hero,
  `hero-woodjam-3d.webp`, is a GeoStrix screenshot of the Woodjam sample (ARIS 41597): drillholes over its 3D geophysics; `og-woodjam-3d.jpg` is the
  link-preview image (og:image), a 1200×628 crop of a GeoStrix screenshot of the Woodjam sample (drillholes and geophysics) — JPEG, because LinkedIn doesn't reliably show WebP previews; `spectral-ferric.webp` / `spectral-truecolour.webp` are Matt's Fireweed project (the
  Sentinel-2 ferric-iron index beside true colour), which the captions say is not the sample project
- `email/geostrix-owl.png` — the owl logo at 144×144 (transparent PNG, from `assets/GeoStrix_Logo.png`) for Matt's email
  signature, which loads it from this exact URL — don't rename or move it
- `fonts/` — Exo 2 (SIL OFL), served from here instead of Google Fonts
- `img/flags/` — the language switcher's flags (Canada EN, Mexico ES — the most Spanish speakers, and
  the pages use Latin-American mining Spanish — Brazil PT, France FR, Saudi Arabia AR), from
  [flag-icons](https://github.com/lipis/flag-icons) 7.6.0 (MIT, `LICENSE-flag-icons.txt`). Mexico is `mx.png`, rendered
  at 60×45 from flag-icons' `mx.svg` (85 KB, mostly the eagle; without it the flag would read as Italy's). Below 1080 px only the flags
  show; the language code stays for screen readers and each link's `title` names the language.
- `_headers` — Cloudflare Pages security / cache headers

## Deploy (Cloudflare Workers, static assets)

The repo root has `wrangler.jsonc`, which tells Cloudflare to serve `website/`, and to run `worker/contact.js` for `/api/*` only (the contact form).

1. Workers & Pages → the `geostrix` Worker → Settings → Build → Build configuration:
   **Build command: empty** (the desktop app's `npm run build` must not run there) · **Deploy command: `npx wrangler deploy`** · Root directory: `/`.
2. Deployments → retry the latest build.
3. Settings → Domains & Routes → Add → Custom domain → `geostrix.com` (and `www.geostrix.com`).

Every push to `master` redeploys. Preview locally with any static server, e.g. `python -m http.server -d website 8080`
(the contact form needs `npx wrangler dev --var CONTACT_TO:you@example.com`, which saves each email as a `.eml` file under `.wrangler/` instead of sending it).

Cloudflare serves `/contact.html` as a 307 redirect to `/contact` (and the same for every `.html` page), so links to
`contact.html` and `privacy.html` work, at the cost of one redirect.

## Contact form

`contact.html` (five languages) → `contact.js` → `POST /api/contact` → `worker/contact.js` → an email to Matt.

- **No cookies, no third-party script.** Spam is stopped by a hidden trap field, a minimum fill-in time (3 s) and a
  rate limit of 5 messages a minute per IP address (`CONTACT_LIMIT`). Not Turnstile: it sets cookies, and every page says the site sets none.
- **Email** goes out through Cloudflare Email Routing's `send_email` binding (`CONTACT_EMAIL`), from
  `contact@geostrix.com`, with the visitor's address as Reply-To, so replying in Gmail answers them.
- **One-time setup in the Cloudflare dashboard** (nothing personal is committed here):
  1. geostrix.com → Email → Email Routing: turned on, and the inbox the messages go to listed and **verified** under Destination addresses.
  2. Workers & Pages → `geostrix` → Settings → Variables and Secrets → Add → type **Secret**, name `CONTACT_TO`, value = that verified address.
  Until both are done, the form answers "could not be sent, please email support@geostrix.com", and nothing breaks.
- The privacy pages describe the form ("Contact form" under "This website"); change them with the Worker.

## Conventions from the web-design review (2026-11-01)

- Links on light backgrounds use `--link` (#975a07, 5.5:1); hover is a thicker underline, not a lighter colour.
  Keyboard focus shows a 3 px orange outline everywhere; every page starts with a "Skip to content" link.
- The brand block is compact so the Download button is on the first screen at 1366×768, 1280×720 and 360×640
  (media queries for short laptops and short phones); re-measure the button's position after any hero change.
- The size in `[data-version]` is static text ("about 240 MB") so it shows without JavaScript or when GitHub's API
  rate-limits a shared IP; `download.js` replaces it with the exact figure. Update it if the installer grows a lot.
- The installed size (~790 MB, written as "about 800 MB") was measured from the v0.1.84 portable zip's file list.
- `.assetsignore` keeps this README from being served at geostrix.com/README.md.
- Home pages carry `rel=canonical`; the privacy pages don't yet, because Cloudflare may redirect `/privacy.html`
  to `/privacy` — check with `curl -sI https://geostrix.com/privacy.html` and point hreflang, the sitemap and a
  canonical at whichever URL answers 200.
- Translated terms follow the app's glossary in `src/locales/*.json` (FR collets, AR فوهات / النمذجة العكسية, ES ensayes).

