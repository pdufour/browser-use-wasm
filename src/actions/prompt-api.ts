import {
  NAV_ASSISTANT_PREFILL,
  sealNavigationText,
  type CompletionClient,
} from './navigation.ts';
import type { ChatCompletionMessage } from '@wllama/wllama';

/** Chrome built-in AI (Prompt API) — multimodal session options. */
export const PROMPT_API_SESSION_OPTIONS = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }, { type: 'image' as const }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

type PromptAvailability =
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available'
  | 'readily'
  | 'after-download'
  | 'no';

interface PromptApiSurface {
  availability?: (options?: typeof PROMPT_API_SESSION_OPTIONS) => Promise<PromptAvailability>;
  capabilities?: () => Promise<{ available: PromptAvailability }>;
  create: (options?: Record<string, unknown>) => Promise<PromptApiSession>;
}

interface PromptApiSession {
  prompt: (
    input: PromptApiTurn[],
    options?: { signal?: AbortSignal }
  ) => Promise<string>;
  execute?: (input: unknown) => Promise<string>;
  destroy?: () => void;
}

type PromptApiTurn =
  | { role: 'user' | 'assistant' | 'system'; content: string; prefix?: boolean }
  | {
      role: 'user';
      content: Array<{ type: 'image'; value: Blob }>;
    };

export interface PromptApiProbeResult {
  ok: boolean;
  status: PromptAvailability;
  message: string;
  diag: string;
}

function promptApiDiagnostics(): string {
  const w = typeof window !== 'undefined' ? (window as Window & { ai?: unknown; model?: unknown }) : null;
  const ai = w?.ai as Record<string, unknown> | undefined;
  const parts = [
    `LanguageModel=${typeof (globalThis as { LanguageModel?: unknown }).LanguageModel}`,
    `window.ai=${!!ai}${ai ? `(${Object.keys(ai).join(',')})` : ''}`,
    `secureContext=${typeof window !== 'undefined' ? window.isSecureContext : 'n/a'}`,
  ];
  return parts.join('; ');
}

/** Resolve Prompt API entry point across Chrome versions. */
export function resolvePromptApi(): PromptApiSurface | null {
  const g = globalThis as { LanguageModel?: PromptApiSurface };
  if (g.LanguageModel && typeof g.LanguageModel.create === 'function') {
    return g.LanguageModel;
  }

  const w = typeof window !== 'undefined' ? (window as Window & { ai?: Record<string, unknown>; model?: Record<string, unknown> }) : null;
  const legacy =
    w?.ai?.languageModel ??
    w?.ai?.textModel ??
    w?.ai?.assistant ??
    w?.model?.languageModel ??
    w?.model?.textModel ??
    w?.model;

  if (legacy && typeof (legacy as PromptApiSurface).create === 'function') {
    return legacy as PromptApiSurface;
  }
  return null;
}

function availabilityMessage(status: PromptAvailability): string {
  switch (status) {
    case 'available':
    case 'readily':
      return 'Built-in AI ready';
    case 'downloadable':
    case 'after-download':
      return 'Built-in AI not on device yet — run a task once to download (Chrome may ask)';
    case 'downloading':
      return 'Chrome is preparing the on-device model…';
    default:
      return 'Prompt API unavailable in this browser';
  }
}

function unavailableHelp(diag: string): string {
  return (
    `Chrome Prompt API (Native AI) not available. ${diag}\n\n` +
    '1. Use Chrome 131+ (138+ recommended) — not Safari, Firefox, or embedded WebViews.\n' +
    '2. Open via http://127.0.0.1:5173/ (npm run dev) — not file://.\n' +
    '3. Enable chrome://flags/#optimization-guide-on-device-model → "Enabled BypassPerfRequirement".\n' +
    '4. Enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input (or #prompt-api-for-gemini-nano).\n' +
    '5. Restart Chrome completely, then chrome://components/ → update "Optimization Guide On Device Model".'
  );
}

/** Probe before load / run — does not create a session. */
export async function checkPromptApiAvailability(): Promise<PromptApiProbeResult> {
  const diag = promptApiDiagnostics();
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      ok: false,
      status: 'unavailable',
      message:
        'Prompt API requires a secure context — use npm run dev (http://127.0.0.1:5173/), not file://.',
      diag,
    };
  }

  const api = resolvePromptApi();
  if (!api) {
    return {
      ok: false,
      status: 'unavailable',
      message: unavailableHelp(diag),
      diag,
    };
  }

  try {
    if (api.availability) {
      const status = await api.availability(PROMPT_API_SESSION_OPTIONS);
      const ok = status !== 'unavailable';
      return {
        ok,
        status,
        message: ok ? availabilityMessage(status) : unavailableHelp(diag),
        diag,
      };
    }
    if (api.capabilities) {
      const cap = await api.capabilities();
      const status = cap.available ?? 'unavailable';
      const ok = status !== 'no' && status !== 'unavailable';
      return {
        ok,
        status,
        message: ok ? availabilityMessage(status) : unavailableHelp(diag),
        diag,
      };
    }
    return { ok: true, status: 'available', message: availabilityMessage('available'), diag };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 'unavailable', message: `${unavailableHelp(diag)}\n\n(${msg})`, diag };
  }
}

function imageBufferToBlob(data: ArrayBuffer): Blob {
  const bytes = new Uint8Array(data);
  const mime = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
  return new Blob([data], { type: mime });
}

function toPromptApiTurns(messages: ChatCompletionMessage[]): PromptApiTurn[] {
  const out: PromptApiTurn[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && typeof msg.content === 'string') {
      out.push({
        role: 'assistant',
        content: msg.content,
        ...(msg.content.startsWith(NAV_ASSISTANT_PREFILL) ? { prefix: true } : {}),
      });
      continue;
    }
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type === 'text' && typeof part.text === 'string') {
        out.push({ role: 'user', content: part.text });
      } else if (part.type === 'image' && part.data instanceof ArrayBuffer && part.data.byteLength) {
        out.push({
          role: 'user',
          content: [{ type: 'image', value: imageBufferToBlob(part.data) }],
        });
      }
    }
  }
  return out;
}

/**
 * Completion client — Chrome built-in Prompt API (Gemini / Gemma Nano).
 * Uses the same ShowUI navigation messages as the wllama worker.
 */
export class PromptApiCompletionClient implements CompletionClient {
  async completion(
    messages: ChatCompletionMessage[],
    _sampling: Record<string, unknown> = {}
  ): Promise<{ text: string; inferMs: number }> {
    const t0 = performance.now();
    const probe = await checkPromptApiAvailability();
    if (!probe.ok) {
      throw new Error(probe.message);
    }

    const api = resolvePromptApi();
    if (!api) throw new Error(probe.message);

    const session = await api.create({
      ...PROMPT_API_SESSION_OPTIONS,
      temperature: 0,
      topK: 1,
    });

    try {
      const turns = toPromptApiTurns(messages);
      const raw = session.prompt
        ? await session.prompt(turns)
        : await session.execute!(turns);
      return {
        text: sealNavigationText(raw),
        inferMs: Math.round(performance.now() - t0),
      };
    } finally {
      session.destroy?.();
    }
  }
}
