// TASKS.csv #786 — the interface in Spanish and Portuguese. The English text is the key: t("Data QC") looks it up in the
// chosen language's dictionary (src/locales/<lang>.json) and falls back to the English itself, so an untranslated string
// still reads correctly and the code stays readable. {name} placeholders are filled from `vars`.
// The dictionary is loaded once before the first render (its own small chunk, not in the startup bundle); a change of
// language re-mounts the app UI (setLanguage below). The choice is a per-computer preference (localStorage, like the
// sidebar widths), defaulting to the system language.
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português (Brasil)" },
];
const KEY = "geostrix.language";
let dict = null;
let current = "en";

export function systemLanguage(navLang) {
  const l = String(navLang || "").toLowerCase();
  return l.startsWith("es") ? "es" : l.startsWith("pt") ? "pt" : "en";
}

export function savedLanguage() {
  try { const v = localStorage.getItem(KEY); if (LANGUAGES.some((x) => x.code === v)) return v; } catch { /* storage unavailable */ }
  return systemLanguage(typeof navigator !== "undefined" ? navigator.language : "");
}

const loaders = { es: () => import("../locales/es.json"), pt: () => import("../locales/pt.json") };

// Before the first render: load the dictionary of the saved (or system) language. Never throws: English on any failure.
export async function initLanguage(code = savedLanguage()) {
  current = loaders[code] ? code : "en";
  if (current === "en") { dict = null; return current; }
  try { dict = (await loaders[current]()).default; } catch { dict = null; current = "en"; }
  if (typeof document !== "undefined") document.documentElement.lang = current === "pt" ? "pt-BR" : current;
  return current;
}

export const currentLanguage = () => current;

// For tests (and the dictionary checks): use this dictionary directly.
export function useDictionary(code, d) { current = code; dict = d; }

// Dev builds only: every key the dictionary lacks is collected in window.__i18nMissing, so a walk through the app in
// Spanish lists the text that arrives at t() at run time (props, tables) and that no literal scan can find.
const missing = typeof window !== "undefined" && import.meta.env?.DEV ? (window.__i18nMissing = new Set()) : null;

export function t(text, vars) {
  let out = text;
  if (dict && typeof text === "string") { const tr = dict[text]; if (tr) out = tr; else if (missing && /[A-Za-z]{2}/.test(text)) missing.add(text); }
  if (vars && typeof out === "string") out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

// Switching: the new dictionary is loaded, then listeners (main.jsx's root) re-mount the app UI under a new key. The
// project lives in the store ABOVE that key, so nothing unsaved is lost (a window reload would have dropped it).
const listeners = new Set();
export function onLanguageChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export async function setLanguage(code) {
  try { localStorage.setItem(KEY, code); } catch { /* storage unavailable: the choice lasts this session only */ }
  await initLanguage(code);
  window.desktop?.setLanguage?.(current); // the native menu follows
  listeners.forEach((fn) => fn(current));
}
