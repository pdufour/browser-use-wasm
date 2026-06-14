/**
 * Generic browser-tool machinery: tool-call types, the `ToolSpec` shape, and
 * functions that derive schemas / summaries / validation / execution from a
 * spec table. This module knows nothing about specific tools — the actual
 * catalog (`TOOL_SPECS`) lives in `./catalog.ts`.
 */

export type PointerAction = 'hover' | 'move' | 'click' | 'doubleclick' | 'rightclick';

export interface BrowserToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  detail?: string;
  error?: string;
  point?: { x: number; y: number };
  recapture?: boolean;
  stopVoice?: boolean;
}

export interface BrowserToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
}

export interface ToolExecutorContext {
  isAppReady: () => boolean;
  hasCapture: () => boolean;
  requestCapture: () => void | Promise<void>;
  /** Locate a label on the screenshot via ShowUI navigation (no live click). */
  locateTarget?: (
    label: string
  ) => Promise<{ ok: boolean; point?: { x: number; y: number } }>;
  setPrompt?: (label: string) => void;
  /** Locate + live pointer action at the grounded point. */
  groundTarget: (
    target: string,
    action: PointerAction
  ) => Promise<{ x: number; y: number }>;
}

export interface ArgSpec {
  enum?: readonly string[];
}

export interface ToolSpec {
  description: string;
  /** String args in declaration order (drives schema + default summary). */
  args?: Record<string, ArgSpec>;
  required?: readonly string[];
  /** Override `name(arg, …)` summary rendering (e.g. quoted input value). */
  summary?: (a: Record<string, unknown>) => string;
  run: (
    call: BrowserToolCall,
    ctx: ToolExecutorContext
  ) => Promise<ToolResult> | ToolResult;
}

// —— Tool-call helpers (no spec table needed) ——

/**
 * Goal field (#prompt) — full voice phrase for INPUT/SELECT so the user sees what was spoken.
 */
export function goalPromptForToolCall(call: BrowserToolCall): string {
  const a = call.arguments;
  const target = String(a.target ?? '').trim();
  if (call.name === 'input' && a.value != null && String(a.value).trim()) {
    return `type ${String(a.value).trim()} in ${target}`;
  }
  if (call.name === 'select' && a.value != null && String(a.value).trim()) {
    return `select ${String(a.value).trim()} in ${target}`;
  }
  return target;
}

/**
 * Screenshot locate label — tool target only (no query rewrite).
 */
export function targetLabelForToolCall(call: BrowserToolCall): string {
  return String(call.arguments.target ?? '').trim();
}

export function toolCallKey(call: BrowserToolCall): string {
  return `${call.name}:${JSON.stringify(call.arguments)}`;
}

// —— Tool-building helpers ——

/**
 * Locate a form control on the screenshot (inference only — no pointer tour).
 */
async function locateFormField(
  ctx: ToolExecutorContext,
  call: BrowserToolCall
): Promise<{ x: number; y: number }> {
  ctx.setPrompt?.(goalPromptForToolCall(call));
  const label = targetLabelForToolCall(call);
  if (!label) throw new Error('Form tool missing target field label');
  if (ctx.locateTarget) {
    const result = await ctx.locateTarget(label);
    if (!result.ok || !result.point) {
      throw new Error(`Could not locate "${label}"`);
    }
    return result.point;
  }
  return ctx.groundTarget(label, 'click');
}

export async function recaptureIfReady(ctx: ToolExecutorContext): Promise<void> {
  if (ctx.isAppReady()) await ctx.requestCapture();
}

/**
 * Vision-grounded field tool (clear / focus / blur / toggle): ground `target`
 * on the screenshot via ShowUI, then act on the element at the grounded point.
 * No label-text lookup fallback — if the point misses, the tool fails honestly.
 */
export function groundedFieldTool(
  description: string,
  verb: string,
  applyAtPoint: (nx: number, ny: number) => boolean,
  opts: { recaptureWithCapture?: boolean } = {}
): ToolSpec {
  return {
    description,
    args: { target: {} },
    required: ['target'],
    async run(call, ctx) {
      const target = String(call.arguments.target);
      const point = await locateFormField(ctx, call);
      if (!applyAtPoint(point.x, point.y)) {
        return {
          ok: false,
          error: `Could not ${verb} "${target}" at grounded point`,
          point,
        };
      }
      if (opts.recaptureWithCapture && ctx.isAppReady() && ctx.hasCapture()) {
        await ctx.requestCapture();
      }
      return { ok: true, detail: target, point };
    },
  };
}

/** Ground `target` on the screenshot, then apply `value` at the grounded point. */
export function groundedValueTool(
  description: string,
  applyAtPoint: (nx: number, ny: number, value: string) => boolean
): ToolSpec {
  return {
    description,
    args: { target: {}, value: {} },
    required: ['target', 'value'],
    async run(call, ctx) {
      const target = String(call.arguments.target);
      const value = String(call.arguments.value);
      const point = await locateFormField(ctx, call);
      if (!applyAtPoint(point.x, point.y, value)) {
        return {
          ok: false,
          error: `Could not apply "${value}" to "${target}" at grounded point`,
          point,
        };
      }
      return { ok: true, detail: value, point };
    },
  };
}

// —— Spec-table-driven derivation ——

/**
 * OpenAI-style tool schemas (for docs, future LLM routers, and validation).
 */
export function deriveToolDefinitions(
  specs: Record<string, ToolSpec>
): readonly BrowserToolDefinition[] {
  return Object.entries(specs).map(([name, spec]) => ({
    name,
    description: spec.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(spec.args ?? {}).map(([arg, argSpec]) => [
          arg,
          argSpec.enum ? { type: 'string', enum: [...argSpec.enum] } : { type: 'string' },
        ])
      ),
      ...(spec.required?.length ? { required: [...spec.required] } : {}),
      additionalProperties: false,
    },
  }));
}

export function summarizeToolCall(
  specs: Record<string, ToolSpec>,
  call: BrowserToolCall
): string {
  const spec = specs[call.name];
  if (!spec) return call.name;
  if (spec.summary) return spec.summary(call.arguments);
  const args = (spec.required ?? []).map((key) => call.arguments[key]);
  return `${call.name}(${args.join(', ')})`;
}

export function validateToolCallWith(
  specs: Record<string, ToolSpec>,
  call: BrowserToolCall
): BrowserToolCall {
  const spec = specs[call.name];
  if (!spec) throw new Error(`Unknown tool: ${call.name}`);

  const args = call.arguments ?? {};
  for (const key of spec.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      throw new Error(`Tool ${call.name} missing argument: ${key}`);
    }
  }

  const out: Record<string, unknown> = {};
  for (const [key, argSpec] of Object.entries(spec.args ?? {})) {
    if (args[key] === undefined || args[key] === null) continue;
    const value = String(args[key]);
    if (argSpec.enum && !argSpec.enum.includes(value)) {
      throw new Error(`Tool ${call.name}: invalid ${key} "${value}"`);
    }
    out[key] = value;
  }
  return { name: call.name, arguments: out };
}

/**
 * Validate then execute a browser tool call against a spec table.
 */
export async function executeToolCallWith(
  specs: Record<string, ToolSpec>,
  rawCall: BrowserToolCall,
  ctx: ToolExecutorContext
): Promise<ToolResult> {
  const call = validateToolCallWith(specs, rawCall);
  const spec = specs[call.name];
  if (!spec) return { ok: false, error: `Unhandled tool: ${call.name}` };
  return spec.run(call, ctx);
}
