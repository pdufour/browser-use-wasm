# Browser-use in the browser (Substack draft)

Generic tutorial outline — not tied to Gemini Nano or a single library.

---

## Hook

Browser automation without a server: **capture → VLA → act → re-capture** until the task finishes.

---

## Pipeline (diagram)

`Capture → (VLA → Act)+` — the parenthesized steps repeat every turn.

ShowUI navigation mode can emit **several dicts in one decode** (e.g. `CLICK` → `INPUT` → `ENTER`). After actions run, the page changes → **new screenshot** → VLA again.

Export PNG from **http://127.0.0.1:5173/substack/** (with `npm run dev`).

---

## Step 1 — Multimodal session

You need a model API that accepts **text + image**. Options:

- **Chrome Prompt API** + on-device Gemini (experimental)
- **WASM GGUF** in a worker (ShowUI, GUI-G2, etc. via wllama)
- **WebLLM / MLC** WebGPU bundles
- **Cloud VL APIs** (GPT-4V, Claude, Gemini API) — data leaves the device

Pick one stack; the rest of the loop is the same.

---

## Step 2 — Capture the page

The model only sees a **bitmap** of the UI region you will hit-test later. Once you’ve picked screenshot + VLA, you still have to **build the bitmap**. Four common paths:

| Library | Mechanism | Typical pain |
|---------|-----------|--------------|
| **[html2canvas](https://github.com/niklasvh/html2canvas)** | Walk DOM, repaint with canvas 2D commands | Slow; misses a lot of modern CSS; `<canvas>` / `<video>` often blank |
| **[html-to-image](https://github.com/bubkoo/html-to-image)** | Clone DOM into SVG `foreignObject`, rasterize | Same FO text path as SnapDOM — drift class of bugs; less tuned for realtime |
| **[SnapDOM](https://github.com/zumerlab/snapdom)** | Optimized FO clone + optional `drawElementImage` when flag is on | Fast enough for voice; still FO→canvas ink issues (~2px drift, [issue #421](https://github.com/zumerlab/snapdom/issues/421)) |
| **[HTML-in-Canvas](https://github.com/WICG/html-in-canvas)** (WICG) | Native compositor snapshot via `drawElementImage()` / `captureElementImage()` | Chrome flag only (`chrome://flags/#canvas-draw-element`); page must live under a `layoutsubtree` canvas; needs `onpaint` wiring — not a drop-in SnapDOM swap yet |

**Why the last row matters:** clone libraries re-implement layout in SVG/canvas. HTML-in-Canvas asks the **browser’s own paint engine** for a snapshot — the same path that draws the live page. That’s the plausible fix for vertical drift; SnapDOM can call it when the flag is on, but agent capture still needs proper `layoutsubtree` + `paint` event plumbing.

Runnable example today: `snapdom.toCanvas(target, { width, height, dpr, embedFonts: true })`.

You re-run capture **every agent turn** after the DOM changes — not just once at the start.

---

## Step 3–4 — Agent loop (VLA + Act)

Each turn:

1. **VLA** — screenshot + task → action dict(s) (`CLICK`, `INPUT`, `ENTER`, …)
2. **Act** — `elementFromPoint` at each `position` → click / type / select
3. **Re-capture** — fresh screenshot for the next observation
4. Repeat until the task is done

**VLA options:** ShowUI-2B, GUI-G2, MAI-UI (WASM in browser); Gemini Nano (Prompt API); cloud VL APIs.

ShowUI [navigation mode](https://huggingface.co/showlab/ShowUI-2B) can return several dicts per decode; grounding-only prompts return a single `[x, y]`.

No label-text DOM lookup for grounding — the vision point must be load-bearing.

---

## What to link

- Live demo: [browser-use-wasm on GitHub Pages](https://pdufour.github.io/browser-use-wasm/)
- Tuned WASM path: ShowUI operator (`/home/`)
- Gemini Nano experiment: `/gemma-nano/` (Prompt API only — not a substitute for ShowUI)

---

## Hardware / constraints

- Chrome or Edge, WebGPU for WASM VLAs
- COOP/COEP for threaded WASM (dev server headers in repo)
- Model size: ~2GB first download for ShowUI Q4; Nano is built into Chrome when enabled
