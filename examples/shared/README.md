# `examples/shared/`

Thin vanilla JS modules reused by focused VLA examples. **Not** a second product runtime — import `src/` for inference, capture, and browser tools.

## Modules

| File | Use |
|------|-----|
| `operator-session.js` | `createOperatorSession()` — HMR dashboard operator; `createOperatorSession({ onStatus, captureStageEl, … })` — embed panel |
| `capture-ui.js` | SnapDOM canvas mount, `syncCaptureUi`, marker, `data-viewport` toggle (Cmd/Ctrl+Shift+S) |
| `dom.js` | `$()` helper |
| `browse-defaults.js` | `BUILTIN_BROWSE_PATH` for shop-demo fixture |
| `task-runner.js` | `initTaskRunner()` — autoload model, iframe URL, goal form, run task (gallery `/browse/`) |
| `gallery-tasks.js` | Curated sample task sites for the gallery |
| `user-facing.js` / `user-facing.css` | Human status copy, hide dev chrome, autoload helpers |
| `perf-log.js` | `logPerfEvent` re-export + `logCaptureWallPerf` / `logTaskPerf` |
| `marker.css` / `panel.css` | Shared overlay / embed panel styles |
| `styles/tokens.css` | Shared CSS custom properties (optional per example) |

Import the library as a real package dependency:

```js
import { createWebOperator } from 'browser-use-wasm';
```

The examples app depends on `"browser-use-wasm": "file:.."`. Run `npm install` inside `examples/` — imports resolve from `node_modules/browser-use-wasm` (symlink to the repo root).

## Conventions (workers 2–7)

1. **E2E contract** — `examples/operator/` remains the gate app. Preserve ids: `#prompt`, `#btn-task`, `#btn-capture`, `#screenshot-img`, `#click-marker`, `#raw-output`, `#model-switcher`, `#model-status`, and `data-testid` attrs. Do not rename `?e2e=1` hooks (`__e2eVoiceTool`).
2. **Client-side only** — all examples use browser WASM worker + SnapDOM; no DOM grounding cheats.
3. **Thin shared layer** — extract only real duplication; keep example-specific UI (React shell, layout, voice) local.
4. **Dev URL** — `npm run dev` serves **homepage at `/`** (`root: examples/home`); **operator at `/home/`**.
5. **Multi-page build** — add your demo to `DEMO_PAGES` in `vite.demo-pages.js` (rollup input + dev route).
6. **Styles** — shared tokens only; per-example fonts/public assets and chrome CSS stay under `examples/<name>/`.

## Task runner bootstrap

```js
import { initTaskRunner } from '../shared/task-runner.js';

initTaskRunner({
  initialUrl: '/sites/confirm-dialog/index.html',
  initialGoal: 'click OK on the dialog',
});
```

## Operator reference

`examples/operator/ui/app.jsx` is the full productivity dashboard (command bar, browse iframe, voice). Smaller examples can subset the same shared helpers without copying imperative capture logic.
