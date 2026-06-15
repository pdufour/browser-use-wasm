# Browser-use in the browser (Substack draft)

Generic tutorial outline — not tied to Gemini Nano or a single library.

---

## Hook

Browser automation without a server: screenshot the page, ask a vision model where to click, act on the live DOM.

---

## Pipeline (diagram)

`Live page → capture → vision model → DOM action at [x, y]`

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

The model only sees a **bitmap** of the UI region you will hit-test later. Client-side capture options:

| Approach | Notes |
|----------|--------|
| **SnapDOM** | DOM clone → canvas; same-origin iframes; used in this repo’s operator |
| **drawElementImage** | Chrome HTML-in-Canvas (`chrome://flags/#canvas-draw-element`); native layout raster |
| **html2canvas / dom-to-image** | Older `foreignObject` SVG path |
| **Tab / compositor capture** | Extension APIs or `getDisplayMedia` for full viewport |

Runnable example in repo: `snapdom.toCanvas(target, { width, height, dpr, embedFonts: true })`.

---

## Step 3 — Ground with a vision model

**Grounding** = screenshot + goal → structured action, usually normalized `[x, y]` on that image.

| Category | Examples |
|----------|----------|
| **GUI / VLA** (tuned for web screenshots) | ShowUI-2B, GUI-G2, UI-TARS, MAI-UI |
| **On-device browser AI** | Gemini Nano + Prompt API |
| **General VLMs** | Often weaker on pixel coords unless prompted carefully |

ShowUI-style models output dicts like `{'action': 'CLICK', 'position': [0.42, 0.71]}`.

---

## Step 4 — Execute on the live page

Map norm coords to pixels on the **same** capture root → `elementFromPoint` → click / type / select.

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
