# Substack tutorial (browser-use)

Draft assets for a **generic** browser-use article — separate from the [Gemini Nano demo](../../examples/gemma-nano/).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Pipeline + capture options + library landscape + SnapDOM pipeline + drift demo + drift debug timeline + star charts (export cards) |
| `diagram.js` | Dark frame toggle, PNG/SVG export (per-card PNG targets) |
| `capture-benchmark.csv` | SnapDOM vs html2canvas-pro timings (Datawrapper chart `OYr7Q`) |
| `capture-comparison.csv` | Token table data (Datawrapper chart `ZUOL7`) |
| `capture-libraries.csv` | Capture library landscape table — Library column uses markdown GitHub links (Datawrapper `kJYQ5`) |
| `measure-web-token-limits.mjs` | DOM token counts (Node) + Chrome WebGPU runtime probe |
| `capture-benchmark.html` | Interactive SnapDOM vs [html2canvas-pro](https://github.com/yorickshan/html2canvas-pro) timing page |
| `capture-benchmark.mjs` | Shared browser benchmark (product SnapDOM path) |
| `benchmark-capture.mjs` | Playwright driver → `capture-benchmark.csv` |
| `drift-demo.mjs` | Static live vs SnapDOM side-by-side on drift card |
| `embeds.json` | Datawrapper chart ids/revisions for standalone embed pages |
| `embed-shell.html` | Template for `embeds/*.html` |
| `generate-embeds.mjs` | Regenerate `embeds/*.html` from `embeds.json` |
| `embeds/*.html` | One Datawrapper iframe per chart (Substack paste — no COEP) |
| `push-datawrapper-table.mjs` | Push CSVs to Datawrapper (`--tokens`, `--libraries`, `--runtime`, `--benchmark`) |
| `article-outline.md` | Article draft |

## Diagram export

With the dev server already running:

```bash
npm run dev
```

Open **http://127.0.0.1:5173/substack/** — each diagram card has a **PNG** download button (top-right, 2× retina). Toggle **Dark frame** in the toolbar before exporting if needed.

**Important:** open via `npm run dev` — not `file://` or a static host without `star-history-svgs/`. If SVG assets 404, Vite’s SPA fallback used to inject the homepage HTML into star chart cards (now blocked with an error message).

| Card | PNG filename |
|------|----------------|
| Agent pipeline | `browser-use-pipeline-substack.png` |
| Capture options | `browser-use-capture-substack.png` |
| Library landscape | `browser-use-libraries-substack.png` |
| SnapDOM pipeline | `browser-use-snapdom-substack.png` |
| Vertical drift (demo) | `browser-use-drift-substack.png` |
| Drift debug timeline | `browser-use-drift-debug-substack.png` |
| Star history (full card) | `browser-use-stars-substack.png` |
| Star history (combined) | `browser-use-stars-combined-substack.png` |
| Star history (each repo) | `browser-use-stars-{repo}-substack.png` |

## Star history data

```bash
node docs/substack/fetch-star-history.mjs
GITHUB_TOKEN=ghp_… node docs/substack/fetch-star-history.mjs   # full JSON + refresh SVGs
```

Caches `star-history.json` (GitHub stargazers) and `star-history-svgs/` (star-history.com charts, light + dark).

## Token measurement

1. **Node** — fetch HTML, tokenize once per page (Qwen2.5 tokenizer)
2. **Chrome WebGPU** — load Qwen2.5-0.5B Instruct (q4), ascending scan until OOM, report **75%** of max working prompt vs DOM sizes

```bash
node docs/substack/measure-web-token-limits.mjs
node docs/substack/measure-web-token-limits.mjs --tokens-only   # skip Chrome probe
CHROME_PROBE_HEADED=1 node docs/substack/measure-web-token-limits.mjs   # if headless WebGPU fails
```

First Chrome run downloads ~300–500 MB. Probe uses `https://example.com` (secure context required for WebGPU).

## Capture benchmark (SnapDOM vs html2canvas-pro)

Interactive page (with dev server):

```bash
npm run dev
# http://127.0.0.1:5173/substack/capture-benchmark.html
```

Automated run (writes `capture-benchmark.csv`):

```bash
npm install   # pulls html2canvas-pro devDependency
npm run dev   # separate terminal
npm run benchmark:capture
```

Options: `BENCHMARK_RUNS=10`, `BENCHMARK_WARMUP=1`, `BENCHMARK_HEADED=1`, `BENCHMARK_BASE_URL=…`. Re-push chart after re-run:

```bash
npm run benchmark:capture
node docs/substack/push-datawrapper-table.mjs --benchmark
```

## Datawrapper

Charts for **Substack** live in `embeds/` — one HTML file per chart, served without COEP so Datawrapper iframes load. The main `index.html` export cards use native HTML/SVG previews (not iframes).

```bash
node docs/substack/generate-embeds.mjs   # after hand-editing embeds.json
# http://127.0.0.1:5173/substack/embeds/benchmark.html
```

```bash
export DATAWRAPPER_TOKEN=...   # app.datawrapper.de/account/api-tokens
node docs/substack/push-datawrapper-table.mjs           # both tables
node docs/substack/push-datawrapper-table.mjs --libraries
node docs/substack/push-datawrapper-table.mjs --benchmark
```

| Chart | CSV | Embed asset |
|-------|-----|-------------|
| `ZUOL7` | `capture-comparison.csv` | `/substack/embeds/tokens.html` |
| `kJYQ5` | `capture-libraries.csv` | `/substack/embeds/libraries.html` |
| `tFStz` | `runtime-context-limits.csv` | `/substack/embeds/runtime.html` |
| `OYr7Q` | `capture-benchmark.csv` | `/substack/embeds/benchmark.html` |

The libraries chart uses a **3-column** layout (one family per column) with colored headers, bordered cells, markdown GitHub links, and intro/footer notes matching the HTML export card. Re-push after CSV edits:

```bash
node docs/substack/push-datawrapper-table.mjs --libraries
```

## Draft

See `article-outline.md` for section structure (capture options, VLM options, grounding loop). Paste into Substack when ready.
