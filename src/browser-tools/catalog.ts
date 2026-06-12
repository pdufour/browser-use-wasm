/**
 * Browser tool catalog — data only: the `TOOL_SPECS` table declaring every
 * tool's schema args and executor, the tool-name sets, and the derived
 * OpenAI-style schemas. Used by scripted tours and the E2E harness (structured
 * tool-call injection); production voice runs the ShowUI navigation mode (see
 * `llm-intent-parsing.mdc`). Pointer targets are located via ShowUI navigation
 * on the screenshot; tools apply live-page effects.
 *
 * Generic machinery (types, tool-building helpers) lives in `./tool-spec.ts`;
 * the validate/summarize/execute entry points live in `./execute.ts`.
 */

import {
  scrollPage,
  resetScrollForCapture,
  typeAtNorm,
  clearAtNorm,
  focusAtNorm,
  blurAtNorm,
  toggleCheckboxAtNorm,
  selectOptionAtNorm,
  pressKey,
} from './dom-actions.ts';
import {
  groundedFieldTool,
  groundedValueTool,
  recaptureIfReady,
  deriveToolDefinitions,
} from './tool-spec.ts';
import type { BrowserToolDefinition, PointerAction, ToolSpec } from './tool-spec.ts';

/** Pointer tools — named after the ShowUI nav action space (`CLICK`, `HOVER`, …). */
export const POINTER_TOOL_NAMES: readonly PointerAction[] = [
  'click',
  'hover',
  'move',
  'doubleclick',
  'rightclick',
];

export const TOOL_SPECS: Record<string, ToolSpec> = {
  // —— Session / capture ——
  stop_voice: {
    description: 'Stop voice navigation listening',
    run: () => ({ ok: true, stopVoice: true, detail: 'stopped' }),
  },
  capture_page: {
    description: 'SnapDOM capture of the page into the screenshot panel',
    async run(_call, ctx) {
      await ctx.requestCapture();
      return { ok: true, detail: 'captured' };
    },
  },
  play_cursor_tour: {
    description: 'Run the multi-stop fake cursor tour on the screenshot',
    run: () => ({ ok: true, detail: 'tour' }),
  },
  // —— Page / scroll ——
  press_key: {
    description:
      'Keyboard action on the live page (Tab focus, Enter activate, Escape dismiss)',
    args: { key: { enum: ['Tab', 'Enter', 'Escape'] } },
    required: ['key'],
    async run(call, ctx) {
      const key = call.arguments.key as 'Tab' | 'Enter' | 'Escape';
      const { ok, detail } = pressKey(key);
      if (!ok) return { ok: false, error: detail };
      if ((key === 'Tab' || key === 'Enter') && ctx.isAppReady()) {
        await ctx.requestCapture();
      }
      return { ok: true, detail };
    },
  },
  scroll: {
    // ShowUI nav `SCROLL` — value is the direction to scroll.
    description: 'Scroll the active container up or down, then refresh capture',
    args: { value: { enum: ['up', 'down'] } },
    required: ['value'],
    async run(call, ctx) {
      const direction = call.arguments.value as 'up' | 'down';
      scrollPage(direction);
      await recaptureIfReady(ctx);
      return { ok: true, detail: direction };
    },
  },
  scroll_to_top: {
    description: 'Jump the scroll position back to the top, then refresh capture',
    async run(_call, ctx) {
      resetScrollForCapture();
      await recaptureIfReady(ctx);
      return { ok: true, detail: 'top' };
    },
  },
  // —— Form fields (vision-grounded: ShowUI point → element at point) ——
  clear_field: groundedFieldTool(
    'Ground a text input on the screenshot, then clear it at the grounded point',
    'clear',
    clearAtNorm,
    { recaptureWithCapture: true }
  ),
  focus_field: groundedFieldTool(
    'Ground a form control on the screenshot, then focus it at the grounded point',
    'focus',
    focusAtNorm
  ),
  blur_field: groundedFieldTool(
    'Ground a form control on the screenshot, then blur it at the grounded point (opposite of focus_field)',
    'blur',
    blurAtNorm
  ),
  // ShowUI nav `INPUT` — value is the string to type.
  input: {
    ...groundedValueTool(
      'Ground a field on the screenshot, then type the value at the grounded point',
      typeAtNorm
    ),
    summary: (a) => `input("${a.value}", ${a.target})`,
  },
  toggle_checkbox: groundedFieldTool(
    'Ground a checkbox on the screenshot, then toggle it at the grounded point',
    'toggle',
    toggleCheckboxAtNorm
  ),
  // ShowUI nav `SELECT` — value is the option to pick.
  select: {
    ...groundedValueTool(
      'Ground a dropdown on the screenshot, then set the select value at the grounded point',
      selectOptionAtNorm
    ),
    summary: (a) => `select(${a.value}, ${a.target})`,
  },
  // —— ShowUI pointer on screenshot (nav `CLICK` / `HOVER` + cursor variants) ——
  ...Object.fromEntries(
    POINTER_TOOL_NAMES.map((action): [string, ToolSpec] => [
      action,
      {
        description: `Ground a UI label on the screenshot with ShowUI and ${action} it with the fake cursor`,
        args: { target: {} },
        required: ['target'],
        async run(call, ctx) {
          const target = String(call.arguments.target);
          const point = await ctx.groundTarget(target, action);
          return { ok: true, detail: `${action} ${target}`, point };
        },
      },
    ])
  ),
};

/** Tools that need a model inference on the screenshot (capture required). */
export const SCREENSHOT_TOOL_NAMES: Set<string> = new Set([
  ...POINTER_TOOL_NAMES,
  'input',
  'select',
  'toggle_checkbox',
  'clear_field',
  'focus_field',
  'blur_field',
]);

/**
 * OpenAI-style tool schemas (for docs, future LLM routers, and validation).
 */
export const BROWSER_TOOL_DEFINITIONS: readonly BrowserToolDefinition[] =
  deriveToolDefinitions(TOOL_SPECS);
