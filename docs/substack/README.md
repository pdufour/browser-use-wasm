# Substack tutorial (browser-use)

Draft assets for a **generic** browser-use article — separate from the [Gemini Nano demo](../../examples/gemma-nano/).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Pipeline + capture options + library landscape + SnapDOM pipeline + drift debug (export cards) |
| `diagram.js` | Dark frame toggle, PNG/SVG export (5 PNG targets) |
| `capture-comparison.csv` | Token table data for the comparison card |
| `measure-web-token-limits.mjs` | DOM token counts (Node) + Chrome WebGPU runtime probe |
| `push-datawrapper-table.mjs` | Private script to push CSV to Datawrapper (optional) |
| `article-outline.md` | Article draft |

## Diagram export

With the dev server already running:

```bash
npm run dev
```

Open **http://127.0.0.1:5173/substack/** → export PNGs:

| Button | Diagram |
|--------|---------|
| **PNG pipeline (2×)** | Capture → VLA → Act agent loop |
| **PNG capture (2×)** | Four capture options + token table |
| **PNG libraries (2×)** | html-in-canvas vs html2canvas vs SnapDOM landscape |
| **PNG snapdom (2×)** | SnapDOM clone → SVG → canvas pipeline |
| **PNG drift (2×)** | Vertical drift debugging timeline |

## Token measurement

1. **Node** — fetch HTML, tokenize once per page (Qwen2.5 tokenizer)
2. **Chrome WebGPU** — load a small text LLM, binary-search max working prompt size, report **75%** as practical budget vs DOM sizes

```bash
node docs/substack/measure-web-token-limits.mjs
node docs/substack/measure-web-token-limits.mjs --tokens-only   # skip Chrome probe
```

First Chrome run downloads ~300–500 MB from Hugging Face.

## Draft

See `article-outline.md` for section structure (capture options, VLM options, grounding loop). Paste into Substack when ready.
