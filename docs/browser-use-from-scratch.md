# How to build browser-use in the browser from scratch

**browser-use** means: look at a webpage like a human (screenshot), decide what to do (vision model), act on the real page (click, type, select). This guide walks through building that loop **entirely client-side** — no Playwright farm, no API server, no browser extension.

This repo (`browser-use-wasm`) is a reference implementation. You can embed it with `createWebOperator()` or rebuild the same layers yourself.

---

## What you are actually building

You are **not** building “an LLM in the browser.” You are building a **vision grounding + execution pipeline**:

| Layer | Job | Runs where |
|-------|-----|------------|
| **Capture** | Turn DOM → pixels the model can see | Main thread (JS + DOM) |
| **Vision prep** | Resize/encode to the model’s token budget | Main thread + encode worker |
| **Inference** | Screenshot + task → structured actions + `[x, y]` | Dedicated worker (WASM + WebGPU) |
| **Execution** | Map norm coords → live DOM events | Main thread (JS + DOM) |

The model must be a **GUI / VLA model** trained to output click coordinates on screenshots (e.g. [ShowUI-2B](https://huggingface.co/showlab/ShowUI-2B)), not a general chat model that guesses selectors.

---

## The loop (one user goal)

```
Live page  →  SnapDOM screenshot  →  vision resize  →  VLA inference
                                                              ↓
Live page  ←  elementFromPoint(x,y)  ←  parse actions  ←  {'action','position'}
```

**One user action → one inference** (no query rewriting, no trying five task strings). Multi-step batches (e.g. `CLICK` → `INPUT` → `ENTER`) come from **one** model generation; re-capture only between UI-changing steps.

---

## Prerequisites

1. **Chrome or Edge** with WebGPU + JSPI (`WebAssembly.Suspending`).
2. **COOP/COEP headers** on your origin so WASM threads work (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). See `examples/vite.config.js`.
3. **Same-origin `wllama.wasm`** — served from your app (Vite copies it from `@wllama/wllama`).
4. **GGUF weights** — LLM + mmproj (~2 GB for ShowUI-2B). Pre-cache for dev; browser can download public HF URLs on first Load.
5. **A GUI grounding model** with a known prompt + output format.

Probe WebGPU before load:

```ts
const { webgpu } = await operator.probe();
// worker checks navigator.gpu + WebAssembly.Suspending
// load fails if wllama.isSupportWebGPU() is false
```

---

## Build order (from scratch)

### Step 1 — Worker + WASM runtime

Inference must **never** run on the main thread. Pattern:

```
Main thread                    Dedicated Worker
───────────                    ────────────────
WllamaWorkerClient  postMessage →  import @wllama/wllama
  .probe() / .load() / .completion()  ←  wllama.wasm + WebGPU
```

Files in this repo:

- `src/wllama/client.ts` — RPC (`probe`, `load`, `completion`)
- `src/wllama/worker.ts` — loads GGUF, runs `createChatCompletion`
- `src/wllama/browser-shim.ts` — forces browser mode (no Node pthreads)

On load, pass **`n_gpu_layers: 99999`** so the LLM runs on WebGPU (`src/config/vl.ts`). Keep **`offload_kqv: false`** for stable VL output on most GUI models.

Worker load rejects `n_gpu_layers <= 0` and throws if WebGPU is unsupported.

### Step 2 — Screenshot capture (SnapDOM)

The model only sees **pixels**, not the live DOM tree. Use SnapDOM (or equivalent) to clone your target element into a canvas:

```ts
import { snapdom } from '@zumer/snapdom';
import { snapdomCaptureToCanvas } from './snapdom/capture.ts';

const canvas = await snapdomCaptureToCanvas(snapdom, captureRoot);
```

Rules:

- Capture **the same box** you will hit-test at execution time (`getBoundingClientRect` of `captureRoot`).
- Handle **inner scrollers** — SnapDOM clones drop scroll state; emulate scroll with transforms during capture (`emulateScrollPositionsForClone` in `capture.ts`).
- Cap width (e.g. 1280 CSS px) and DPR (e.g. 2) for performance.

### Step 3 — Vision resize + encode

VL models have a fixed **vision token budget**. Downscale the canvas before inference:

```ts
const { canvas: visionCanvas, visionCrop } = await prepareVisionCapture(snapCanvas, modelCard);
const bitmap = await createImageBitmap(visionCanvas);
const { buffer } = await encodeWorker.encodeBitmap(bitmap, { encoding: 'image/png' });
```

Keep two coordinate spaces straight:

- **Vision norm** — what the model outputs (0–1 on the resized/cropped image)
- **Capture norm** — full SnapDOM canvas (for marker overlay + `elementFromPoint`)

Remap with `remapVisionNormToCaptureNorm()` when they differ (`src/snapdom/vision-resize.ts`).

### Step 4 — Prompt + inference

Use the **model card’s** system prompt and message order. For ShowUI web navigation (`src/actions/navigation.ts`):

1. System text (action space + output format)
2. `Task: <user goal verbatim>`
3. Optional action history (formatted dicts from prior steps)
4. Image bytes
5. Assistant prefill: `{'action':`

```ts
const messages = buildShowUINavigationMessages(imageBuffer, task, history);
const { text, inferMs } = await client.completion(messages, {
  max_tokens: 256,
  temperature: 0,
  top_k: 1,
});
const { actions } = parseNavigationActions(text);
```

Expected output shape (Python-style dicts, comma-separated for multi-step):

```python
{'action': 'CLICK', 'value': None, 'position': [0.42, 0.71]}
{'action': 'INPUT', 'value': 'paul@example.com', 'position': [0.35, 0.22]}
{'action': 'ENTER', 'value': None, 'position': None}
```

Positions are **normalized 0–1 on the screenshot the model saw**.

Optional: **prefix prewarm** — one cheap completion at load time to cache the static system prompt in KV (`prewarmNavigationPrefix`).

### Step 5 — Parse coordinates (no DOM)

Parse model text only. Clamp to `[0, 1]`. Tolerate 0–100 / 0–1000 scales if the model emits them:

```ts
export function navigationPositionToPoint(pos: unknown): GroundingPoint | null {
  // [x, y] or [[x1,y1],[x2,y2]] for SELECT_TEXT
}
```

**Forbidden:** reading `#btn-submit` from the live DOM to fix or score coordinates.

### Step 6 — Execute on the live page

Convert capture-norm `(x, y)` to viewport pixels on `captureRoot`, then:

```ts
const rect = captureRoot.getBoundingClientRect();
const vpX = rect.left + nx * rect.width;
const vpY = rect.top + ny * rect.height;
const el = document.elementFromPoint(vpX, vpY);
el?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: vpX, clientY: vpY }));
```

For inputs: if the point lands on a `<label>`, `closest('input, textarea, select')` is fine — the **point** chose it, not a text search.

Implement actions in `src/actions/execute.ts` → `src/browser-tools/dom-actions.ts`:

| Action | Needs point? | Behavior |
|--------|--------------|----------|
| `CLICK` | yes | `triggerActionAtNorm` |
| `INPUT` | yes | focus + set value + input events |
| `SELECT` | yes | open/select option at point |
| `ENTER` | no | `pressKey('Enter')` |
| `SCROLL` | no | scroll container |

If `elementFromPoint` misses, **fail honestly** (`ok: false`) — do not fall back to `querySelector('[placeholder=…]')`.

### Step 7 — Multi-step + re-capture

When one generation returns `CLICK → INPUT → ENTER`:

1. Run each action in order.
2. After `CLICK`, `SELECT`, or `INPUT`, the UI may change → **capture again** before the next action in the *same* batch (see `instruct()` in `src/operator.ts`).
3. Stale captures: bump a `generation` counter; reject inference if capture changed mid-flight.

---

## Minimal embed (use the library)

```ts
import { createWebOperator } from 'browser-use-wasm';

const operator = createWebOperator({
  captureRoot: () => document.getElementById('app'),
  targetDocument: () => document,
});

await operator.load({ onStatus: console.log });
await operator.capture();
const result = await operator.instruct('click Submit');
console.log(result.summary, result.steps);
```

Under the hood this is Steps 1–7 wired together in `src/operator.ts`.

---

## Minimal skeleton (build yourself)

```ts
// 1. Workers
const llm = new WllamaWorkerClient();
await llm.probe('/wllama/wllama.wasm');
await llm.load('/wllama/wllama.wasm', { modelId: 'ShowUI-2B', nGpuLayers: 99999 });

// 2. Capture
const snapCanvas = await snapdomCaptureToCanvas(snapdom, root);
const { canvas: vision } = await prepareVisionCapture(snapCanvas, model);
const imageBuffer = await encodeToPng(vision);

// 3. Infer
const nav = await runNavigation(llm, imageBuffer, 'click Submit');

// 4. Act
for (const action of nav.actions) {
  const point = remapVisionNormToCaptureNorm(action.point, visionCrop);
  executeNavigationAction({ ...action, point });
}
```

---

## Architecture diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Main thread                          │
│  captureRoot ──► SnapDOM ──► vision resize ──► encode worker│
│       ▲                              │                      │
│       │         WllamaWorkerClient   │ image ArrayBuffer    │
│       │              │               ▼                      │
│       │              ▼         runNavigation()              │
│       │         [Worker RPC]                                │
│       │              │                                      │
│  elementFromPoint ◄──┴── parse {'action','position'}        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                   wllama worker (module)                    │
│  @wllama/wllama + wllama.wasm + WebGPU (n_gpu_layers=99999) │
│  createChatCompletion({ messages with image part })         │
└─────────────────────────────────────────────────────────────┘
```

---

## What not to do

| Anti-pattern | Why |
|--------------|-----|
| Ground with live DOM rects / selectors | Cheating; breaks on any layout change |
| Rewrite user task (“11” → “select 11”) | Overfits evals; wrong product semantics |
| Run inference on main thread | Blocks UI; WASM pthread model expects worker |
| `n_gpu_layers: 0` | Too slow; often unusable for VL in browser |
| Server-side VLA for coords | Violates client-only browser-use story |
| Skip re-capture after modal open | Next action targets wrong screenshot |

---

## Checklist before shipping

- [ ] COOP/COEP on dev + prod origins
- [ ] WebGPU probe fails with clear error
- [ ] Capture box matches execution hit-test root
- [ ] Vision crop remap tested (marker aligns with click)
- [ ] One task string in → one inference out
- [ ] Execution uses `elementFromPoint` at model coords only
- [ ] Inference timeout (default 12s) surfaced to user
- [ ] Model weights load from cache or HF without Node at runtime

---

## Further reading in this repo

| Topic | Location |
|-------|----------|
| Public embed API | `src/operator.ts`, `README.md` |
| ShowUI prompts + parsing | `src/actions/navigation.ts` |
| Worker RPC + WebGPU gate | `src/wllama/worker.ts`, `src/wllama/client.ts` |
| SnapDOM capture | `src/snapdom/capture.ts` |
| Vision resize | `src/snapdom/vision-resize.ts` |
| DOM execution | `src/browser-tools/dom-actions.ts` |
| Model registry | `src/config/models/` |
| E2E contract | `.cursor/rules/blackbox-e2e.mdc` |

---

## Chrome built-in AI demo (Prompt API)

Live demo: **`/builtin-ai/`** — same browser-use loop (SnapDOM → structured actions → DOM execution) using **Gemini Nano** via the [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) instead of wllama/ShowUI.

```ts
import { createPromptApiOperator } from 'browser-use-wasm';

const operator = createPromptApiOperator({ captureRoot: () => document.getElementById('app') });
await operator.probe();
await operator.load();
await operator.capture();
await operator.instruct('click Submit');
```

Requires Chrome 138+ desktop with built-in AI flags enabled. Grounding quality varies vs ShowUI — this path is for zero-GGUF, built-in-AI discovery demos.

---

## Alternative backends (optional)

**Chrome Prompt API (Gemini Nano)** can replace the wllama worker for inference only — still need JS for capture + execution. Structured JSON output helps, but GUI grounding quality is unproven vs ShowUI. See discussion in issues/PRs; not the default path in this repo.

The capture + execute layers are **always JavaScript** — WASM has no DOM access.
