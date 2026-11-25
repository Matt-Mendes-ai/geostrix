// TASKS.csv #4073 — for the dialogs moved onto StepDialog: which step of its `steps` array a piece of source falls in, so a test can pin that every setting is still
// reachable in its step. stepSplit(source, ["data", "model", "run"]) -> { stepOf(token), source }
import { readFileSync } from "node:fs";
export const readSrc = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
export function stepSplit(src, keys) {
  const at = keys.map((k) => src.indexOf(`key: "${k}"`)), end = src.indexOf("return <StepDialog");
  if (at.some((i) => i < 0) || end < 0) throw new Error("the steps array was not found");
  return {
    at, end,
    stepOf(token) {
      const i = src.indexOf(token, at[0]);
      if (i < 0) return "MISSING";
      for (let k = keys.length - 1; k >= 0; k--) if (i >= at[k]) return i < end ? keys[k] : "outside";
      return "before";
    },
  };
}
// every token of every step is in that step; -> the list of "token (found in x)" mismatches
export const misplaced = (split, where) => Object.entries(where).flatMap(([step, tokens]) => tokens.filter((t) => split.stepOf(t) !== step).map((t) => `${t}: ${split.stepOf(t)}, wanted ${step}`));
export const localeMissing = (keys) => ["es", "pt", "fr", "ar"].flatMap((l) => { const d = JSON.parse(readSrc(`src/locales/${l}.json`)); return keys.filter((k) => !d[k]).map((k) => `${l}: ${k}`); });
