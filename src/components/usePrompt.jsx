// TASKS.csv #1779 (review #1646, Kodiak) — window.prompt() throws in Electron ("prompt() is not supported"): "Values are > Other…" for a block
// model, "Rename set" and the Level plan's outline name each failed with an uncaught error. The same in-app PromptModal the 3D View uses,
// as a hook: const [ask, promptEl] = usePrompt(); ask(title, defaultValue, (value) => ...); render {promptEl}.
import React, { useState } from "react";
import PromptModal from "./PromptModal.jsx";

export function usePrompt() {
  const [state, setState] = useState(null); // { title, defaultValue, onSubmit } | null
  const ask = (title, defaultValue, onSubmit) => setState({ title, defaultValue: defaultValue || "", onSubmit });
  const el = state ? (
    <PromptModal title={state.title} defaultValue={state.defaultValue} onCancel={() => setState(null)}
      onConfirm={(value) => { const s = state; setState(null); s.onSubmit(value); }} />
  ) : null;
  return [ask, el];
}
