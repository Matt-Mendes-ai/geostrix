# geostrix.com

The GeoStrix website: plain HTML + CSS, no build step, no framework, no cookies, no tracking (TASKS.csv #597).

- `index.html` — home, features, screenshots, download, support
- `privacy.html` — privacy policy (keep in step with `../PRIVACY.md`)
- `download.js` — points the download buttons at the newest `GeoStrix-Setup-*.exe` on GitHub Releases
  (falls back to the latest-release page without JavaScript or if GitHub's API is unreachable)
- `img/` — screenshots from the bundled Harry sample project (ARIS report 37584), WebP
- `fonts/` — Exo 2 (SIL OFL), served from here instead of Google Fonts
- `_headers` — Cloudflare Pages security / cache headers

## Deploy (Cloudflare Workers, static assets)

The repo root has `wrangler.jsonc`, which tells Cloudflare to serve `website/` and nothing else.

1. Workers & Pages → the `geostrix` Worker → Settings → Build → Build configuration:
   **Build command: empty** (the desktop app's `npm run build` must not run there) · **Deploy command: `npx wrangler deploy`** · Root directory: `/`.
2. Deployments → retry the latest build.
3. Settings → Domains & Routes → Add → Custom domain → `geostrix.com` (and `www.geostrix.com`).

Every push to `master` redeploys. Preview locally with any static server, e.g. `python -m http.server -d website 8080`.
