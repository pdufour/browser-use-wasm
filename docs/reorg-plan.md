# Source reorganization plan

> **Status: executed.** All six steps landed (config/util, wllama/actions,
> snapdom/browser-tools/voice, fixtures + Vite, test harness moves, ui/ move),
> each gate-green via `npm run test`. Remaining follow-up: splitting
> `src/ui/main.js` into per-flow modules (capture/find/task) — deferred.

Goal: group code by responsibility with clean one-way dependencies:

```
fixtures ← (page under test)
snapdom  → image → actions (VLA) → browser-tools (DOM) 
              ↑ wllama (worker RPC)
ui / voice / tests consume the layers above
```

## Proposed layout

```
src/
  snapdom/            # Snapdom Library — webpage → image
  wllama/             # Wllama Wrapper — GGUF model behind a web worker
  actions/            # Action Library — image (+ text) → JSON actions
  browser-tools/      # Actions mapped to DOM interactions
  config/             # Constants + model configs + other configs
  voice/              # Voice Mode
  ui/                 # Operator app shell (NOT in user's list — see gaps)
  util/               # Observability + performance logging
fixtures/             # ShopDemo + fixture code (move out of public/)
tests/                # E2E + Mind2Web
```

## File mapping

### `src/snapdom/` — Snapdom Library
Receives webpage → converts into image.

| Current | New |
|---|---|
| `src/capture-snapdom.js` | `snapdom/capture.js` |
| `src/capture-worker.js` | `snapdom/encode-worker.js` (PNG/JPEG encode off main thread) |
| `src/showui-image.js` | `snapdom/vision-resize.js` (resize/crop canvas to model vision budget) |

### `src/wllama/` — Wllama Wrapper
Receives a GGUF model; interface to calling out to it via a web worker.

| Current | New |
|---|---|
| `src/wllama-client.js` | `wllama/client.js` (main-thread RPC) |
| `src/wllama-worker.js` | `wllama/worker.js` (all inference) |
| `src/wllama-browser-shim.js` | `wllama/browser-shim.js` |
| `src/model-sources.js` | `wllama/model-sources.js` (same-origin `/model-cache/` resolution) |
| `src/hf-resolve-gguf.js` | `wllama/hf-resolve-gguf.js` (used by Node cache scripts) |

### `src/actions/` — Action Library
Receives images → converts into JSON series of actions. All prompt building +
output parsing for the VLA lives here; nothing DOM-aware.

| Current | New |
|---|---|
| `src/grounding-infer.js` | `actions/grounding.js` (label → `[x, y]`) |
| `src/navigation-infer.js` | `actions/navigation.js` (task → `{action, value, position}[]`) |
| `src/parse-coords.js` | `actions/parse-coords.js` |
| intent prompt in `wllama-worker.js` | `actions/intent.js` (transcript → tool-call JSON) — currently inlined in the worker, should be extracted |

### `src/browser-tools/` — Browser Tools
List of actions from the action library mapped to DOM interactions.

| Current | New |
|---|---|
| `src/voice-cursor/browser-actions.js` | `browser-tools/dom-actions.js` (`triggerActionAtNorm`, `typeAtNorm`, `pressKey`, …) |
| `src/voice-cursor/browser-tools.js` | `browser-tools/catalog.js` (tool schemas + `executeBrowserTool`) |
| `src/browser-frame.js` | `browser-tools/browse-frame.js` (iframe nav/history — the surface tools act on) |
| `src/browse-defaults.js` | `browser-tools/browse-defaults.js` |

### `src/config/` — Constants + Configs

| Current | New |
|---|---|
| `src/vl-config.js` | `config/vl.js` (shared VL defaults, timeouts, capture caps) |
| `src/showui-config.js` | `config/models/ShowUI-2B.js` |
| `src/models/*.js` | `config/models/*.js` |
| `src/models/registry.js` | `config/models/registry.js` |
| scattered magic numbers in `main.js` (prewarm query, marker sizes, toast timing) | `config/app.js` |

### `src/voice/` — Voice Mode

| Current | New |
|---|---|
| `src/voice-cursor/voice-nav-controller.js` | `voice/controller.js` |
| `src/voice-cursor/speech-session.js` | `voice/speech-session.js` |
| `src/voice-cursor/fake-cursor.js` | `voice/fake-cursor.js` |
| `src/voice-cursor/cursor-tour.js` | `voice/cursor-tour.js` |
| `src/voice-cursor/README.md` | `voice/README.md` |

### `src/util/` — Observability / performance logging

| Current | New |
|---|---|
| `src/perf.js` | `util/perf.js` (tracker + `logPerfEvent`) |
| `src/perf-grounding.js` | `util/perf-grounding.js` |
| `src/perf-showcase.js` | `util/perf-showcase.js` (or `ui/` — it renders) |
| `src/runtime-hints.js` | `util/runtime-hints.js` (WebGPU/COOP env checks) |

### `fixtures/` — Fixture code

| Current | New |
|---|---|
| `public/browse-fixture/` (ShopDemo) | `fixtures/shop-demo/` (Vite still serves it; keep URL stable or update `browse-defaults`) |
| `public/eval-snapshot/` | `fixtures/eval-snapshot/` (Mind2Web host page) |
| `tests/e2e/fixtures/` | stays with tests |

### `tests/` — already mostly right

| Current | Notes |
|---|---|
| `tests/e2e/e2e.spec.js`, `e2e.js`, `global-setup.js` | stays — single blackbox suite (`blackbox-e2e.mdc`) |
| `scripts/mind2web-grounding-eval.mjs`, `mind2web-model-benchmark.mjs` | move to `tests/mind2web/` (Playwright harness, not product code) |
| `scripts/eval-intent-parsing.mjs` + `tests/browser-use-intent-benchmark.json` | `tests/intent/` |
| `scripts/nav-smoke.mjs` | `tests/smoke/nav-smoke.mjs` (dev-only) |

## Gaps in the proposed structure (things the list is missing)

1. **UI layer / app shell — the biggest one.** `main.js` (3,042 lines) plus
   `agent-fx.js`, `agent-reasoning.js`, `walkthrough-hud.js`, `ui-polish.js`,
   `realtime-ux.js`, `browser-power-user.js`, `browser-use*.js` (4 files),
   `perf-showcase.js`, `src/styles/`, `index.html`. That's ~5,500 lines with no
   home in the proposed buckets. Plan: `src/ui/` with `main.js` split into
   `ui/capture-flow.js`, `ui/find-flow.js`, `ui/task-flow.js`,
   `ui/model-picker.js`, `ui/screenshot-panel.js`, `ui/tours/`.
2. **Node tooling** (dev-only, never product runtime — `client-side-only.mdc`):
   `scripts/cache-model.mjs`, `cache-all-models.mjs`, `cache-public-models.mjs`,
   `verify-model-urls.mjs`, `read-gguf-meta.mjs`, `capture-for-cli.mjs`,
   `e2e-model-ids.mjs`. Keep `scripts/` as the bucket for these.
3. **Vite config** — `vite.config.js` + `vite.wllama-wasm.js` serve
   `/wllama/wllama.wasm` and COOP/COEP headers. Moving `public/browse-fixture`
   means touching Vite static handling; do it in the same PR as fixtures.
4. **Grounding vs navigation vs intent are three different "actions".** The
   action library should expose one explicit interface
   (`ground(label, image)`, `navigate(task, image)`, `intent(transcript)`) so
   the worker stops switch-casing on RPC `type` with inlined prompts.
5. **The KV/prewarm pipeline state machine** (capture prewarm, decode-only,
   per-query cache in `main.js`) is product logic, not UI. It belongs in
   `wllama/` or `actions/` as a `grounding-session.js`, otherwise the `ui/`
   split stays tangled.
6. **Docs cleanup** — `docs/capture-alignment-*.md`, `capture-holy-grail.md`
   reference deleted experiment scripts; prune or archive in the same pass.
   `.cursor/rules/capture-research-first.mdc` points at deleted runners too.

## Constraints (must hold through the reorg)

- **Client-side only** — no inference outside `src/wllama/worker.js`.
- **One E2E suite** — `tests/e2e/e2e.spec.js` only; `playwright.config.js`
  keeps `testMatch: '**/e2e.spec.js'`; timeouts unchanged.
- **No DOM grounding** — `browser-tools/` executes at model coords, never
  computes them.
- Worker import graph: `wllama/worker.js` may import from `actions/` and
  `config/`, never from `ui/` or `browser-tools/`.

## Sequencing (each step gate-green before the next)

1. `src/config/` + `src/util/` (pure moves, import renames).
2. `src/wllama/` + `src/actions/` (move files; extract intent prompt from worker).
3. `src/snapdom/` + `src/browser-tools/` + `src/voice/`.
4. `fixtures/` move + Vite path updates.
5. Test harness moves (`tests/mind2web/`, `tests/intent/`, `tests/smoke/`).
6. `ui/` split of `main.js` — last and biggest; do it after everything else is
   stable so the diff is reviewable.

Each step: `npm run cache:showui && npm run test` must pass 3/3 before moving on.
