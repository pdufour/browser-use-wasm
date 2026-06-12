# Voice cursor + browser tools

Client-side voice drives **function calls** (`src/browser-tools/catalog.ts`). ShowUI still grounds pointer targets on the **screenshot**; form/scroll/key tools touch the **live page** under `#capture-target`.

## Layout

| File | Role |
|------|------|
| `../browser-tools/catalog.ts` | Tool schemas, `executeBrowserTool` (tours + E2E tool injection) |
| `../browser-tools/dom-actions.ts` | Generic DOM helpers (no grounding coords) |
| `../actions/navigation.ts` | ShowUI navigation mode — transcript task → action dicts |
| `controller.ts` | Mic + orchestration + fake cursor |
| `speech-session.ts` | Web Speech API |
| `fake-cursor.ts` | Pointer on screenshot panel |
| `cursor-tour.ts` | Scripted multi-stop tour |

## Browser tools (by group)

Tool names reuse the ShowUI nav action space (`CLICK`, `INPUT`, `SELECT`, `HOVER`, `SCROLL`) where one exists; `value` mirrors the card's action-dict `value` field.

**Session / capture:** `stop_voice`, `capture_page`, `play_cursor_tour`

**Page:** `press_key`, `scroll` (value: up/down), `scroll_to_top`

**Form (live DOM):** `clear_field`, `focus_field`, `blur_field`, `input` (target, value), `toggle_checkbox`, `select` (target, value)

**Screenshot (ShowUI pointer):** `click` | `hover` | `move` | `doubleclick` | `rightclick` (target)

## E2E

Blackbox voice cases use `?e2e=1` and `__e2eVoiceTool` (structured tool calls — no phrase regex in product code) — see `.cursor/rules/blackbox-e2e.mdc`. New tools should extend an existing case when possible instead of adding specs.
