// TASKS.csv #3932 / #4075 — the hook an AI app's modelling tools (build_surface, build_grade_shell, ...) are answered through. ViewerModule calls it; the work itself (modelAction, ~5 kB,
// then guidedRun on first use) is in mcpModelAction.js and is loaded when the first request arrives, so none of it is in the startup chunk.
import { useRef } from "react";
import { useModuleAction } from "../../lib/menuRequests.js";

const fail = (error) => ({ ok: false, error });

export function useMcpModelActions(ctx) {
  const ref = useRef(ctx); ref.current = ctx;
  useModuleAction(["mcp-model"], (_a, p) => {
    const reply = (r) => { try { p?.reply?.(r); } catch { /* the app has gone */ } };
    import("./mcpModelAction.js").then(({ modelAction }) => {
      let done; try { done = modelAction(() => ref.current(), p); } catch { done = Promise.resolve(fail("The model could not be built.")); }
      return done.catch(() => fail("The model could not be built.")).then(reply);
    }, () => reply(fail("The model could not be built.")));
  });
}
