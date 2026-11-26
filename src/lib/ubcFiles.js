// TASKS.csv #4078 — which dropped / chosen files are a UBC-GIF mesh, its models, or neither, by name AND by their first lines (side 1's harvest:
// GSV's mesh is "3dip.mesh", not .msh; SARIG's resistivity model is a .res; GEUS's ".con" files are Geosoft map-control scripts, not models).
import { t as tr } from "./i18n.js";

export const UBC_MESH_NAME = /\.(msh|mesh)$/i;
export const UBC_MODEL_NAME = /\.(chg|con|mod|den|sus|res|sen)$/i;

const lines = (text, n = 40) => String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, n);

// a model file: one number per line (UBC writes one value per cell), at least a few of them
export function looksLikeUbcModelText(text) {
  const l = lines(text, 20);
  return l.length >= 3 && l.every((s) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s));
}

// an Oasis montaj map-control script (.con): DATT / MGRP / RPLS / IFNE / ENDF / SURR ... commands
export function isGeosoftControlText(text) {
  return lines(text, 40).filter((s) => /^(DATT|MGRP|RPLS|IFNE|IFEQ|ENDF|SURR|ANOY|MAPS|DEFP|CALL|TEXT|PLOT|LINE|ZONE)\b/.test(s)).length >= 3;
}

// a file that came without its mesh, or is not a model at all: what it is and where it goes (null: not one of these)
export function ubcLoneAdvice(name, headText) {
  if (isGeosoftControlText(headText)) return tr("{name}: a Geosoft map-control file, not a model.", { name });
  if (looksLikeUbcModelText(headText)) return tr("{name}: a UBC model. Drop it with its mesh (.msh).", { name });
  return null;
}
