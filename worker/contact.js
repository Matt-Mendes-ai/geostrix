// geostrix.com contact form (website/contact.html). The Worker runs only for /api/* (wrangler.jsonc run_worker_first);
// every other request goes straight to the static site in website/, as before.
//
// No cookies and no third-party script: spam is kept out by a hidden trap field, a minimum fill-in time and a per-address
// rate limit (CONTACT_LIMIT), never by a CAPTCHA (Turnstile sets cookies, and the site promises none).
// The message is emailed with Cloudflare Email Routing's send_email binding (CONTACT_EMAIL) to CONTACT_TO, a Worker
// secret set in the Cloudflare dashboard (a verified Email Routing destination), so no personal address is in this repo.
// Nothing is stored: the visitor's IP address is used only as the rate-limit key for that request.
import { EmailMessage } from "cloudflare:email";

const FROM = "contact@geostrix.com"; // must be on the domain that has Email Routing turned on
const CATEGORIES = ["Question", "Bug report", "Feature request", "Training and demos", "Sponsorship", "Press", "Other"];
const LIMITS = { name: 100, email: 200, subject: 150, message: 2000 };
const MIN_FILL_MS = 3000; // a person takes longer than this to fill in the form

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

// RFC 2047 encoded-word for a UTF-8 header value (accents, Arabic), and no line breaks: they would let a visitor add headers
const header = (s) => `=?UTF-8?B?${b64(String(s).replace(/[\r\n]+/g, " "))}?=`;
function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const isEmail = (s) => /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]{2,}$/.test(s);

export function validate(body) {
  const f = {};
  for (const k of ["name", "email", "category", "subject", "message", "lang"]) f[k] = typeof body?.[k] === "string" ? body[k].trim() : "";
  if (!f.name || f.name.length > LIMITS.name) return { error: "name" };
  if (!isEmail(f.email) || f.email.length > LIMITS.email) return { error: "email" };
  if (!CATEGORIES.includes(f.category)) return { error: "category" };
  if (!f.subject || f.subject.length > LIMITS.subject) return { error: "subject" };
  if (f.message.length < 10 || f.message.length > LIMITS.message) return { error: "message" };
  for (const k of ["name", "email", "subject"]) f[k] = f[k].replace(/[\r\n\t]+/g, " "); // one-line fields stay one line
  f.lang = /^[a-z]{2}(-[A-Za-z]{2})?$/.test(f.lang) ? f.lang : "en";
  return { fields: f };
}

export function buildMime(f, to, now = new Date(), id = crypto.randomUUID()) {
  const text = [
    `Name: ${f.name}`, `Email: ${f.email}`, `Category: ${f.category}`, `Page language: ${f.lang}`, "",
    f.message, "", "--", "Sent from the contact form on geostrix.com. Reply to this email to answer the sender.",
  ].join("\r\n");
  const body = b64(text).replace(/.{76}/g, "$&\r\n");
  return [
    `From: ${header("GeoStrix website")} <${FROM}>`,
    `To: <${to}>`,
    `Reply-To: ${header(f.name)} <${f.email}>`,
    `Subject: ${header(`[GeoStrix contact] ${f.category}: ${f.subject}`)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${id}@geostrix.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "", body,
  ].join("\r\n");
}

async function contact(request, env) {
  if (request.method !== "POST") return json(405, { error: "method" });
  // only the site's own pages may post here
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: "origin" });
  if (!env.CONTACT_EMAIL || !env.CONTACT_TO) return json(503, { error: "not_configured" });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "invalid" }); }
  // the trap field and the fill-in time: a bot is told it worked and nothing is sent
  if (body?.extra || !(Number(body?.elapsed) >= MIN_FILL_MS)) return json(200, { ok: true });

  if (env.CONTACT_LIMIT) {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.CONTACT_LIMIT.limit({ key: ip });
    if (!success) return json(429, { error: "rate_limited" });
  }

  const v = validate(body);
  if (v.error) return json(400, { error: v.error });
  try {
    await env.CONTACT_EMAIL.send(new EmailMessage(FROM, env.CONTACT_TO, buildMime(v.fields, env.CONTACT_TO)));
  } catch (e) {
    console.error("contact send failed", e && e.message);
    return json(502, { error: "send_failed" });
  }
  return json(200, { ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/contact") return contact(request, env);
    if (pathname.startsWith("/api/")) return json(404, { error: "not_found" });
    return env.ASSETS.fetch(request);
  },
};
