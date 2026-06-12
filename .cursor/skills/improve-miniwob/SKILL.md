---
name: improve-miniwob
description: Run the MiniWoB eval and iterate on raising the success rate without increasing task-inference latency. Use when the user asks to improve, measure, or iterate on MiniWoB (miniwob/miowob) scores or browser tool-interaction eval results.
---

# Improve MiniWoB score

Iterative loop to raise the MiniWoB success rate with latency pinned flat.

## Preconditions

- Model cached: `npm run cache:showui`
- MiniWoB corpus cached: `node scripts/cache-miniwob.mjs` (gitignored corpus)
- Quiet rig: `pgrep -f playwright` empty and no other eval node process running

## Loop

```
- [ ] 1. Baseline: run the MiniWoB harness (opt-in script under tests/miniwob/, see package.json eval script) — record success rate per tool category
- [ ] 2. Pick ONE generic candidate from the dominant failure mode
- [ ] 3. Re-run the same filtered task set
- [ ] 4. Verify latency: npm run test all-green, best `[perf:e2e] task inference` ms within ~5% of committed baseline
- [ ] 5. Cross-check Mind2Web strict bbox @100 has not regressed (shared levers)
- [ ] 6. Keep → commit with before→after rate + latency ms; Revert otherwise. Repeat.
```

## Allowed levers

Generic only: vision-resize quality (`src/snapdom/vision-resize.ts`), capture JPEG/encode quality, parse robustness, prompt plumbing correctness (card-verbatim `_NAV_SYSTEM` stays verbatim), worker/WASM fixes.

## Forbidden

- Per-task prompt rewriting or MiniWoB-specific heuristics — task instructions pass verbatim
- DOM-derived coordinates, label lookups (`no-dom-grounding.mdc`, `vision-only-execution.mdc`)
- Anything in `no-grounding-query-overfit.mdc`
- Raising e2e timeout constants

## Trade-off bands

Per `.cursor/rules/accuracy-speed-tradeoff.mdc`: ≤5% slower needs any real gain; 5–15% slower needs a dramatic win; >20% never. Commit messages must state both metrics.
