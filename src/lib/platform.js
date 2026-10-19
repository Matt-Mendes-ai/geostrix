// TASKS.csv #773 — the renderer's view of the OS, for the few places the UI has to read like the platform it runs on:
// Mac-style shortcut labels (⌘S, ⇧⌘S, ⌘-click) instead of "Ctrl+S", and copy that names Windows-only things.
// navigator rather than a preload value so it also works in the plain-browser preview. Only in a page (window): Node
// 21+ has a navigator too (MacIntel on a Mac), and `npm test` must see the same strings on every OS.
// Windows/Linux labels are returned untouched.
export const IS_MAC = typeof window !== "undefined" && typeof navigator !== "undefined" && /Mac/.test(navigator.platform || navigator.userAgent || "");

// "Ctrl/Cmd+Shift+S" -> "⇧⌘S", "Ctrl+Z to undo" -> "⌘Z to undo", "Ctrl/Cmd+Click" -> "⌘-click" (Apple's own style:
// modifiers in ⌥⇧⌘ order, glued to the key; a mouse action is hyphenated). Works on whole sentences.
const SHORTCUT = /\b(?:Ctrl\/Cmd|Cmd\/Ctrl|Ctrl|Cmd)((?:\+(?:Shift|Alt))*)\+([A-Za-z]{2,}|[^\s])/g;
export function kbd(text, mac = IS_MAC) {
  if (!mac || typeof text !== "string") return text;
  return text.replace(SHORTCUT, (_m, mods, key) => {
    const glyphs = `${mods.includes("+Alt") ? "⌥" : ""}${mods.includes("+Shift") ? "⇧" : ""}⌘`;
    return key.length > 1 ? `${glyphs}-${key.toLowerCase()}` : `${glyphs}${key.toUpperCase()}`;
  });
}
