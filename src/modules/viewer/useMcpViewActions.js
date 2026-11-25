// TASKS.csv #3932 / #4075 — the hook an AI app's view tools (colour_holes, show_layers, set_view) are answered through. ViewerModule calls it; the work itself (viewAction, ~4 kB) is in
// mcpViewAction.js and is loaded when the first request arrives, so none of it is in the startup chunk (a request is rare and answered in a few milliseconds from local disk).
import { useRef } from "react";
import { useModuleAction } from "../../lib/menuRequests.js";

const fail = (error) => ({ ok: false, error });

export function useMcpViewActions(ctx) {
  const ref = useRef(ctx); ref.current = ctx; // read afresh when the request arrives, as before
  useModuleAction(["mcp-view"], (_a, p) => {
    const reply = (r) => { try { p?.reply?.(r); } catch { /* the app has gone */ } };
    import("./mcpViewAction.js").then(({ viewAction }) => { let r; try { r = viewAction(ref.current(), p); } catch { r = fail("The view could not be changed."); } reply(r); }, () => reply(fail("The view could not be changed.")));
  });
}
