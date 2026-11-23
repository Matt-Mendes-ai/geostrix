// TASKS.csv #4039 (Matt, 2026-11-23, v0.2.9, WA lode gold: "for the sample datasets with lithology, I want them to open displaying lithology only and the
// other layers turned off by default") - a bundled sample whose tables include a lithology log opens with the Lithology layer shown and every other drillhole
// layer (alteration, veins, breccias, weathering, structure planes, structural zones, mineralization, geotech, recovery, specific gravity, magnetic
// susceptibility, the custom layers a sample makes) loaded but hidden; a sample with no lithology (Macpass: assays) keeps the old choice, and so do the
// user's own imports: this state lives only while a sample's own tables are being read.
//
// The import pipeline turns a layer ON as each file lands (importPipelineImpl: setLayerVisible / setCustomVisible); while a lithology-led sample is
// loading it asks shows(target) first. begin() is called when the sample's files are read, end() when its queue is empty (and on an error). The custom layers
// a sample's extras add later (WA uranium's gamma log) are named in hideCustom() and read back, once, by the viewer when it first draws them.
let active = false, ledSample = false;
const hiddenCustom = new Set();

// the sample's own file names: does it carry a lithology log?
export const hasLithology = (names) => (names || []).some((n) => /^litho\.csv$/i.test(String(n || "")));

export const sampleLithOnly = {
  begin() { active = true; ledSample = true; },
  end() { active = false; }, // the queue is empty
  finish() { ledSample = false; }, // the sample's loader is done, extras included (the queue may still be reading: active ends with it)
  active: () => active,
  led: () => ledSample, // a lithology-led sample is still loading: what its extras add starts hidden
  // may this layer be switched on by the import that just landed? target: a layer key ("litho", "alt", ...) or "custom"
  shows: (target) => !active || target === "litho",
  hideCustom(id) { hiddenCustom.add(id); },
  // true once for a custom layer a lithology-led sample made: it starts hidden
  takeHiddenCustom(id) { return hiddenCustom.delete(id); },
  reset() { active = false; ledSample = false; hiddenCustom.clear(); },
};
