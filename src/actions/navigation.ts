/**
 * ShowUI UI Navigation mode — card-verbatim prompts (showlab/ShowUI-2B).
 * Task + screenshot → next action dict: {'action': 'INPUT', 'value': ..., 'position': [x, y]}.
 * The single LLM path: prompt building + parsing here, inference via the
 * generic wllama worker client (`client.completion`).
 */

import type { ChatCompletionMessage } from '@wllama/wllama';
import type { GroundingPoint } from './parse-coords.ts';

/** Raw card-format action dict as emitted by the model (Python-literal keys). */
export interface NavigationActionDict {
  action: string;
  value: string | null;
  position: number[] | [number, number][] | null;
}

/** Structured action after parsing/normalizing one card dict. */
export interface NavigationAction {
  action: string;
  value: string | null;
  point: GroundingPoint | null;
}

/** Parsed generation: sealed text plus every valid action dict found. */
export interface ParsedNavigation {
  text: string;
  actions: NavigationAction[];
}

/** Full navigation inference result. */
export interface NavigationResult extends ParsedNavigation {
  degenerate: boolean;
  inferMs: number;
}

/** @see https://huggingface.co/showlab/ShowUI-2B — `_NAV_SYSTEM` (web split). */
const NAV_SYSTEM_TEMPLATE = `You are an assistant trained to navigate the {_APP} screen. 
Given a task instruction, a screen observation, and an action history sequence, 
output the next action and wait for the next observation. 
Here is the action space:
{_ACTION_SPACE}
`;

/**
 * Single structured source for the ShowUI action space. Each description is
 * the model-card `action_map['web']` text verbatim (including trailing
 * spaces) — `NAV_ACTION_SPACE_WEB` is assembled from this table.
 */
export const NAV_ACTIONS = {
  CLICK: 'Click on an element, value is not applicable and the position [x,y] is required. ',
  INPUT: 'Type a string into an element, value is a string to type and the position [x,y] is required. ',
  SELECT: 'Select a value for an element, value is not applicable and the position [x,y] is required. ',
  HOVER: 'Hover on an element, value is not applicable and the position [x,y] is required.',
  ANSWER: "Answer the question, value is the answer and the position is not applicable.",
  ENTER: 'Enter operation, value and position are not applicable.',
  SCROLL: 'Scroll the screen, value is the direction to scroll and the position is not applicable.',
  SELECT_TEXT:
    'Select some text content, value is not applicable and position [[x1,y1], [x2,y2]] is the start and end position of the select operation.',
  COPY: 'Copy the text, value is the text to copy and the position is not applicable.',
} as const;

export type NavActionName = keyof typeof NAV_ACTIONS;

/** Action names derived from the structured table. */
export const NAV_ACTION_NAMES: readonly string[] = Object.keys(NAV_ACTIONS);

/** @see model card `action_map['web']` — built byte-identical from {@link NAV_ACTIONS}. */
const NAV_ACTION_SPACE_WEB = `\n${Object.entries(NAV_ACTIONS)
  .map(([name, desc], i) => `${i + 1}. \`${name}\`: ${desc}`)
  .join('\n')}\n`;

/** @see model card `_NAV_FORMAT` (verbatim). */
const NAV_FORMAT = `
Format the action as a dictionary with the following keys:
{'action': 'ACTION_TYPE', 'value': 'element', 'position': [x,y]}

If value or position is not applicable, set it as \`None\`.
Position might be [[x1,y1], [x2,y2]] if the action requires a start and end position.
Position represents the relative coordinates on the screenshot and should be scaled to a range of 0-1.
`;

export const NAV_SYSTEM_WEB =
  NAV_SYSTEM_TEMPLATE.replace('{_APP}', 'web').replace(
    '{_ACTION_SPACE}',
    NAV_ACTION_SPACE_WEB
  ) + NAV_FORMAT;

/** ShowUI navigation emits a Python-style dict starting with `{'action':`. */
export const NAV_ASSISTANT_PREFILL = "{'action':";

/**
 * Card uses max_new_tokens=128 and the model emits a comma-separated action
 * sequence in one generation, e.g. CLICK field → INPUT text → ENTER.
 */
export const NAV_MAX_TOKENS = 256;

export const NAV_SAMPLING = {
  max_tokens: NAV_MAX_TOKENS,
  temperature: 0,
  top_k: 1,
  top_p: 1.0,
};

export function normalizeNavigationTask(task: string): string {
  const t = String(task ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!t) throw new Error('Task is required (e.g. "type paul in the email field")');
  return t;
}

/**
 * One-token warmup that prefills the shared `_NAV_SYSTEM` prefix into the
 * worker's KV/prompt cache at load time. Every navigation prompt starts with
 * the same system text, so the first real task then only prefills the
 * image + task suffix (llama.cpp server-style prefix cache). Not a grounding
 * inference — no image, output discarded.
 */
export async function prewarmNavigationPrefix(client: CompletionClient): Promise<void> {
  try {
    await client.completion(
      [{ role: 'user', content: [{ type: 'text', text: NAV_SYSTEM_WEB }] }],
      { max_tokens: 1, temperature: 0 }
    );
  } catch {
    /* warmup is best-effort */
  }
}

/**
 * Format one executed action as a card-style Python dict literal for the
 * action-history slot. Coordinates are the model's own (vision-norm) output,
 * rounded like the card examples.
 */
export function formatNavigationActionForHistory(action: NavigationAction): string {
  const value =
    action.value == null ? 'None' : `'${String(action.value).replace(/'/g, "\\'")}'`;
  const position = action.point
    ? `[${action.point.x.toFixed(2)}, ${action.point.y.toFixed(2)}]`
    : 'None';
  return `{'action': '${action.action}', 'value': ${value}, 'position': ${position}}`;
}

/**
 * Card message order (verbatim): system → Task: … → [past actions] → image,
 * plus dict-open prefill. Do NOT reorder the image before the task — ShowUI is
 * trained on this layout and image-first prompting degrades grounding (e.g.
 * "Remember me" → bottom-right Submit circle). The history slot is the card's
 * commented `{"type": "text", "text": PAST_ACTION}` between the task and the
 * image — one formatted action dict per line (the model's own output format).
 */
export function buildShowUINavigationMessages(
  imageBuffer: ArrayBuffer,
  task: string,
  history: readonly string[] = []
): ChatCompletionMessage[] {
  if (!imageBuffer?.byteLength) {
    throw new Error('Screenshot buffer is empty — capture the page first');
  }
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: NAV_SYSTEM_WEB },
        { type: 'text', text: `Task: ${normalizeNavigationTask(task)}` },
        ...(history.length ? [{ type: 'text' as const, text: history.join('\n') }] : []),
        { type: 'image', data: imageBuffer },
      ],
    },
    { role: 'assistant', content: NAV_ASSISTANT_PREFILL },
  ];
}

/**
 * Re-attach the assistant prefill so the text starts at the first dict.
 */
export function sealNavigationText(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '';
  if (!t.startsWith("{'action':") && !t.startsWith('{"action":')) {
    return `${NAV_ASSISTANT_PREFILL} ${t}`;
  }
  return t;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Vision JPEG width/height the model saw (for pixel-style `position` values). */
export interface NavigationVisionSize {
  width: number;
  height: number;
}

function normalizeCoordPair(
  pair: unknown,
  visionSize?: NavigationVisionSize
): GroundingPoint | null {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  let x = Number(pair[0]);
  let y = Number(pair[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (x <= 1 && y <= 1) {
    return { x: clamp01(x), y: clamp01(y) };
  }
  if (x <= 100 && y <= 100) {
    return { x: clamp01(x / 100), y: clamp01(y / 100) };
  }
  const vw = visionSize?.width ?? 0;
  const vh = visionSize?.height ?? 0;
  if (vw > 0 && vh > 0 && x <= vw && y <= vh) {
    return { x: clamp01(x / vw), y: clamp01(y / vh) };
  }
  if (x <= 1000 && y <= 1000) {
    return { x: clamp01(x / 1000), y: clamp01(y / 1000) };
  }
  return null;
}

/**
 * Normalize card position field: [x,y], [[x1,y1],[x2,y2]], or null.
 * Two corner pairs → bbox center (models often emit a box for CLICK, not a point).
 */
export function navigationPositionToPoint(
  pos: unknown,
  visionSize?: NavigationVisionSize
): GroundingPoint | null {
  if (!Array.isArray(pos) || pos.length === 0) return null;

  if (
    Array.isArray(pos[0]) &&
    Array.isArray(pos[1]) &&
    pos[0].length >= 2 &&
    pos[1].length >= 2
  ) {
    const p0 = normalizeCoordPair(pos[0], visionSize);
    const p1 = normalizeCoordPair(pos[1], visionSize);
    if (!p0 || !p1) return null;
    return {
      x: clamp01((p0.x + p1.x) / 2),
      y: clamp01((p0.y + p1.y) / 2),
    };
  }

  return normalizeCoordPair(Array.isArray(pos[0]) ? pos[0] : pos, visionSize);
}

/**
 * Parse one Python-literal action dict into a structured action.
 */
function parseOneNavigationDict(
  dictText: string,
  visionSize?: NavigationVisionSize
): NavigationAction | null {
  const jsonish = dictText
    .replace(/'/g, '"')
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonish) as Record<string, unknown>;
  } catch {
    return null;
  }
  const action = String(parsed.action ?? '').toUpperCase();
  if (!NAV_ACTION_NAMES.includes(action)) return null;

  const value = parsed.value == null ? null : String(parsed.value);
  const point = navigationPositionToPoint(parsed.position, visionSize);
  return { action, value, point };
}

/**
 * Parse a ShowUI navigation generation. The card output is a comma-separated
 * sequence of dicts (e.g. CLICK → INPUT → ENTER) in one decode pass.
 */
export function parseNavigationActions(
  raw: string | null | undefined,
  visionSize?: NavigationVisionSize
): ParsedNavigation {
  const text = sealNavigationText(raw);
  if (!text) return { text: '', actions: [] };

  const actions: NavigationAction[] = [];
  // Dicts are flat except nested position arrays — match balanced one-level braces.
  for (const match of text.matchAll(/\{[^{}]*\}/g)) {
    const parsed = parseOneNavigationDict(match[0], visionSize);
    if (parsed) actions.push(parsed);
  }
  return { text, actions };
}

/** Minimal completion API needed from the wllama worker client. */
export interface CompletionClient {
  completion(
    messages: ChatCompletionMessage[],
    sampling?: Record<string, unknown>
  ): Promise<{ text: string; inferMs: number }>;
}

/**
 * Run one ShowUI navigation inference: build card-verbatim messages, run a
 * generic completion in the wllama worker, parse the action dict sequence.
 */
export async function runNavigation(
  client: CompletionClient,
  imageBuffer: ArrayBuffer,
  task: string,
  history: readonly string[] = [],
  visionSize?: NavigationVisionSize
): Promise<NavigationResult> {
  const messages = buildShowUINavigationMessages(imageBuffer, task, history);
  const { text: raw, inferMs } = await client.completion(messages, NAV_SAMPLING);
  console.info(`[nav:raw] "${raw}"`);
  const { text, actions } = parseNavigationActions(raw, visionSize);
  return {
    text,
    actions,
    degenerate: actions.length === 0,
    inferMs,
  };
}
