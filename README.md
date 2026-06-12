# browser-use-wasm

**browser-use in WASM** — vision-language automation with no backend. **browser-use-wasm** runs the full **browser-use** loop client-side: SnapDOM screenshot → ShowUI grounding → live-page click/type/select. Default model is **ShowUI-2B**; swap others from the built-in model selector. Chrome or Edge only (WebGPU + WASM workers).

## How browser-use works

**browser-use** here means: look at the page like a human (screenshot), decide what to do (VLA), act on the real DOM at the grounded point.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Live page  │ ──► │   SnapDOM    │ ──► │ ShowUI VLA  │ ──► │  DOM action  │
│  (iframe)   │     │  screenshot  │     │ WASM worker │     │ at [x, y]    │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
```

1. **Capture** — SnapDOM clones the target element (or iframe content) into a canvas. This is what **browser-use** “sees”.
2. **Resize** — the image is downscaled to the model’s vision token budget.
3. **Infer** — one ShowUI navigation call per user goal. The model outputs structured actions (`CLICK`, `INPUT`, `SELECT`, `ENTER`, …) with normalized `[x, y]` on the **screenshot only**.
4. **Execute** — **browser-use** acts on the **live page** via `elementFromPoint` at that coordinate. No label-text DOM lookup for grounding.

**One goal → one inference → execute all parsed actions.** Mid-batch UI changes (e.g. `CLICK` then `INPUT`) trigger an automatic re-capture before the next step.

Coordinates never come from live DOM layout, selectors, or OCR — only from vision inference on the SnapDOM buffer.

## Installation

Run **browser-use-wasm** locally — the **browser-use** stack lives entirely in the tab.

### Requirements

- **Chrome or Edge** with WebGPU + JSPI — **browser-use** inference runs here, not on a server
- Dev server must send COOP/COEP headers (included in `vite.config.js`)
- Public registry models **download in the browser** on first Load (~1.8 GB for ShowUI-2B Q4_K_M + mmproj); swap models from the built-in selector

### Get started (consumer)

```bash
npm install github:pdufour/browser-use-wasm#main
# or: yarn add pdufour/browser-use-wasm#main
```

`examples/` is excluded from the published tarball (see `.npmignore`).

### Develop this repo

Library is the root package (`browser-use-wasm`). The `examples/` app links it locally via `"browser-use-wasm": "file:.."`.

```bash
npm install                              # root — tests, cache scripts, library dev
cd examples && npm install && cd ..      # links browser-use-wasm from repo root
npm run dev                              # homepage at /, operator at /home/
npm run build                            # dist/lib/ + dist/examples/
npm run typecheck                        # src + examples
```

### Embed browser-use in your app

## API

**browser-use-wasm** exposes a small embed API for **browser-use** automation. High-level entry point: **`createWebOperator()`** → load model → SnapDOM capture → **`instruct(goal)`**.

### Quick example

```ts
import { createWebOperator } from 'browser-use-wasm';

const operator = createWebOperator({
  // What to screenshot (default: document.body)
  captureRoot: () => document.getElementById('app'),
  // What document to click/type in (default: host document; use iframe contentDocument for embeds)
  targetDocument: () => document.getElementById('frame')?.contentDocument ?? document,
});

await operator.load({
  onStatus: (msg) => console.log(msg),
});

const cap = await operator.capture();
await cap.whenEncoded; // wait for JPEG encode in worker

const result = await operator.instruct('click Submit', {
  onStatus: (msg) => console.log(msg),
  onBeforeStep: async (step) => {
    // animate cursor before each CLICK / INPUT / …
  },
});

console.log(result.summary); // e.g. "CLICK → INPUT → ENTER"
console.log(result.steps);   // per-action ok/detail + capture-norm points
```

### `createWebOperator(options?)`

| Option | Default | Description |
|--------|---------|-------------|
| `modelId` | `ShowUI-2B` | Registry model id |
| `wasmUrl` | `/wllama/wllama.wasm` | Same-origin wllama WASM |
| `captureRoot` | `document.body` | Element SnapDOM captures |
| `targetDocument` | host `document` | Live page DOM tools act on |
| `inferenceTimeoutMs` | `12000` | Per-inference ceiling |
| `onPerfMark` | — | Capture pipeline timing hooks |

### `WebOperator` methods

| Method | Description |
|--------|-------------|
| `load(opts?)` | Download and load GGUF in the browser WASM worker |
| `capture()` | **browser-use** capture — SnapDOM → vision resize → async JPEG encode |
| `instruct(task, opts?)` | One ShowUI inference + execute all parsed **browser-use** actions |
| `locate(label)` | Ground `click <label>` on current capture without executing |
| `hasCapture()` | Whether a screenshot buffer is ready |
| `clearCapture()` | Drop screenshot (next instruct needs `capture()` again) |
| `setModel(id)` | Switch registry model (requires `load()` again) |
| `probe()` | Check WebGPU in the worker |
| `dispose()` | Terminate workers |

### `instruct()` callbacks

| Callback | When |
|----------|------|
| `onBeforeExecute` | Parsed actions ready, before any DOM execution |
| `onBeforeStep` | Before each step — `{ action, value, point }` in capture-norm space |
| `onStep` | After each step — `{ action, value, point, ok, detail }` |
| `onStatus` | Human-readable progress (`CLICK …`, `INPUT …`, `Done — …`) |
| `onRecapture` | Fresh `OperatorCapture` after a UI-changing mid-batch step |

### `OperatorCapture`

| Field | Description |
|-------|-------------|
| `canvas` | Full SnapDOM canvas (marker overlay space) |
| `width` / `height` | Vision bitmap dims (what the model sees) |
| `captureWidth` / `captureHeight` | Full canvas pixel dims |
| `cssWidth` / `cssHeight` | Integer CSS size on screen |
| `whenEncoded` | `Promise<ArrayBuffer \| null>` — inference JPEG |
| `generation` | Bumps on each capture; stale instructs are rejected |

### Environment checks

```ts
import { getWllamaEnvIssues, canLoadVlModelInBrowser } from 'browser-use-wasm';

const issues = getWllamaEnvIssues(); // COOP/COEP, browser, WebGPU hints
```

## Tests

**browser-use-wasm** is validated with blackbox E2E in real Chrome — live page → SnapDOM → ShowUI-2B → screenshot marker checks. Playwright needs weights in `.model-cache/` ahead of time; that Node download path is **for tests and evals only**, not normal **browser-use** in the app.

```bash
npx playwright install chrome
npm run cache:showui        # pre-cache ShowUI-2B for E2E
npm run test                # ShowUI-2B gate — 34 browser-use cases in real Chrome
npm run test:benchmark      # optional cross-model comparison (npm run cache:public first)
```

See `.cursor/rules/blackbox-e2e.mdc` for the E2E contract.

## Optional evals

```bash
npm run eval:mind2web     # offline Mind2Web grounding — docs/mind2web-eval.md
npm run cache:miniwob && npm run eval:miniwob
```
