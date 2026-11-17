# GeoStrix as a Model Context Protocol server (TASKS.csv #3190): design note

Status: v1 BUILT 2026-11-17 on Matt's answers (pipe / socket + `--mcp-bridge`; off unless 'keep it on' is ticked; the PNG snapshot later, v1.1; the per-client allow prompt; phase 3 and the review harness left undecided). Written 2026-11-17.

## What was built (differences from the design below)
- **No SDK.** MCP over stdio is newline-delimited JSON-RPC 2.0; the part GeoStrix needs (initialize, ping, tools/list, tools/call) is `electron/mcpProtocol.js`, about 150 lines with no dependency, so there is no new package to ship, license or keep up to date.
- **Ten tools**, not eight: the table's `list_layers` / `get_layer_rows` and `list_sections` / `get_section` are each two (`electron/mcpToolDefs.json` is the one list; a test keeps the code and the list the same).
- **Files:** `electron/mcpProtocol.js` (protocol, argument checks, scrubbing, caps, rate limit), `electron/mcpHost.js` (the pipe, the token, the endpoint file, the allow list, the call into the window), `electron/mcpBridge.js` (`GeoStrix.exe --mcp-bridge`), `src/lib/mcpTools.js` (the tools, in a lazy chunk), `src/components/AiAccessModal.jsx` (Tools > AI App Access: the switch, 'keep it on', the privacy notice, the entry to copy, the connected apps, Stop, the activity list), a status-bar indicator, and main.js's wiring (bridge mode before the single-instance lock; IPC accepted from the main window only; the first-connection question as a native box whose default button is 'Don't allow').
- **Guards, twice** (main and window): schema check of every argument, paths and credential-like names refused, 200 rows and ~90 kB a call, 60 calls a minute, replies scrubbed of credential-like fields and absolute paths, an error from inside the app never forwarded.
- **Not verified live (the app could not be run when this was written):** that a packaged GeoStrix.exe started as `--mcp-bridge` by Claude Desktop passes stdin / stdout through (a GUI-subsystem Electron exe); the fallback is `ELECTRON_RUN_AS_NODE=1` with a small script. The pipe, the token, the protocol and the bridge are tested on a real pipe in `test/mcpServer3190.test.mjs`.


## What it is
An optional, local server so the user's own AI app (Claude Desktop, or any MCP client) can **read the open project** while they work. No model is bundled and nothing leaves the computer except what the user's AI app then sends to its own provider (said plainly in the app, in PRIVACY.md and on the website privacy pages).

## Scope of version 1: read-only, a small set of tools
Each tool is an interface to maintain, so the set is short and every tool has a test. All results are JSON, capped (rows and bytes) and paged.

| Tool | Gives |
| --- | --- |
| `project_summary` | name, CRS, counts (holes, assay intervals, layers, models, sections), elements and units, data credit and licence text |
| `list_holes` | hole id, collar E / N / RL, azimuth, dip (printed as #3878), length, collar fields; filter by a field and value; paged |
| `get_hole` | one hole: collar, survey stations, logged intervals by layer, assays |
| `get_assays` | one hole or a depth range, one or more elements, in the stored unit and the display unit; paged |
| `list_layers`, `get_layer_rows` | the logs (lithology, alteration ...) with their codes, and their rows for a hole; paged |
| `grade_stats` | one element: count, mean, percentiles, the cap candidates; optionally by a domain layer |
| `best_intercepts` | Best intercepts' rule with typed cut-off, dilution and minimum length; the same numbers as the dialog |
| `list_sections`, `get_section` | the saved sections and what lies along one (intervals, intercepts, structures) as text |

Version 1.1, only if Matt wants it: `snapshot` (the 3D view or a section as a PNG). Not in version 1: anything that changes the project, imports, runs a model, writes a file or opens a path. Phase 3 (later, separately decided) would add actions, each confirmed inside GeoStrix.

## Security
- **Off by default.** A switch in Settings, "Let my AI app read this project". It turns itself off when the app closes unless the user chose "remember" in the same dialog.
- **Local only, no network port.** The app listens on a **named pipe (Windows) or a Unix socket in a per-user folder**, readable only by the user, with a per-launch token. There is no TCP port: a web page in a browser cannot reach it (the DNS-rebinding class of problem the sidecar's token already guards, electron/main.js).
- **Read-only.** No tool writes, imports, runs a job or touches a file. The tools take hole ids, element symbols and layer names, never file paths; nothing returns a path (not the project file, not the user-data folder). No shell.
- **Nothing secret.** Database passwords, stored credentials, the project's file path and the user-data folder are never in a result.
- **The user sees it.** A status-bar indicator while it is on, the connected client's name, and an activity list (tool, time, rows returned) with a Stop button. The first connection of a client asks "allow once / always".
- **Capped.** Rows, bytes and calls per minute are limited, so a runaway client cannot freeze the app or pull the whole project in one call.

## How it runs
- **In the Electron main process**, loaded **only when the switch is on** (a dynamic import of `@modelcontextprotocol/sdk`), never in the renderer's startup JavaScript (#3159 budget; the main process has no such budget but it starts nothing at launch either).
- The project lives in the **renderer** (the React store), not in the main process. The server asks the renderer through IPC (`mcp-request`), and a lazy module there (`src/lib/mcpTools.js`, pure functions over the store's state, so they test in Node) answers. The main process only moves the question and the capped answer.
- **The MCP client launches a tiny bridge**, because Claude Desktop speaks stdio: `GeoStrix.exe --mcp-bridge` (a mode of the same executable that opens no window, connects to the pipe with the token and copies stdin / stdout; it exits when either side closes). Claude Desktop's config gets one entry; the Settings page shows it with a Copy button. Not the Python sidecar: the project is not there either, and a second server process would add a second place to keep in step.
- No localhost HTTP version in the first build. If a client needs it later, it would be a second transport with the same token rule, off by default again.

## What the user turns on
1. Settings > AI app access: the switch, a plain notice of what the AI app receives and where it goes, and the Claude Desktop entry to paste (`command`: the installed GeoStrix.exe, `args`: `--mcp-bridge`).
2. Restart the AI app once; ask it about the project.
3. Stop from the status bar or the Settings page at any time.

## Phases
1. This note, then Matt's decisions.
2. The read-only version above: the switch, the pipe, the bridge, the eight tools, the activity list; tests per tool (synthetic projects) and one end-to-end test with a scripted client.
3. Actions that change the project (import, composite, model runs, layouts, exports), each confirmed in the app; the review harness could then drive GeoStrix through these tools instead of CDP clicks.

## Decisions wanted from Matt
1. Pipe / socket plus the `--mcp-bridge` mode (recommended), or a localhost HTTP port with a token?
2. Does the switch remember across launches, or ask each time (recommended: ask each time unless "remember" is ticked)?
3. Include the PNG `snapshot` in version 1 or later?
4. Is the "allow once / always" prompt per client wanted, or the switch alone?
5. May the review harness use phase 3 later in place of CDP clicks (it would need the confirmation step switched off for its own throw-away profile)?
