# MiniWoB++ eval results history

Tool-execution success on the filtered MiniWoB++ set (`npm run eval:miniwob`,
ShowUI-2B, 15 tasks × 3 episodes, seeds `miniwob-eval-<task>-<ep>`). This file
is intentionally committed — append one row per completed full run (newest
last). Latency is the green-circle metric: best `[perf:e2e] task inference` ms
from `npm run test`.

| date | commit | tasks run | overall success | per-tool breakdown | best task-inference ms |
|---|---|---|---|---|---|
| 2026-06-11 | 7f62c0f | 15 × 3 eps (45) | 20/45 (44.4%) | click 10/27 (37%), toggle_checkbox 0/3, select 0/3, input 6/6 (100%), focus_field 4/6 (67%) | 1730 |
| 2026-06-11 | (local) | 15 × 3 eps (44†) | 21/44 (47.7%) † | click 11/26 (42%), toggle_checkbox 1/3, select 0/3, input 6/6 (100%), focus_field 3/6 (50%) | — |

† `click-widget#2` harness timeout (excluded from denominator). Candidate: upscale small captures in `fitVisionPixelBudget` when width-filled and tokens &lt;65% of cap — **reverted**: +1 success within noise; ungated variant blew E2E task-inference to ~4261ms (840×308 band upscaled); gated variant not re-validated after rig contention.
