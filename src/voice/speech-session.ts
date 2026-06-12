/**
 * Browser Web Speech API — continuous dictation (client-side only).
 */

/**
 * Minimal ambient types for the Web Speech API recognition interface —
 * lib.dom ships the event/result types but not `SpeechRecognition` itself.
 */
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  // eslint-disable-next-line no-var
  var SpeechRecognition: SpeechRecognitionConstructor | undefined;
  // eslint-disable-next-line no-var
  var webkitSpeechRecognition: SpeechRecognitionConstructor | undefined;
}

export type SpeechSessionState = 'idle' | 'listening' | 'error';

export interface SpeechSessionHooks {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onState?: (state: SpeechSessionState) => void;
}

export interface SpeechSession {
  isListening: () => boolean;
  start(): void;
  stop(): void;
  abort(): void;
}

export function isSpeechRecognitionAvailable(): boolean {
  return !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
}

export function createSpeechSession(hooks: SpeechSessionHooks = {}): SpeechSession | null {
  const SpeechRecognition =
    globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  let listening = false;
  let autoContinue = false;

  recognition.onstart = () => {
    listening = true;
    hooks.onState?.('listening');
  };

  recognition.onend = () => {
    listening = false;
    if (autoContinue) {
      try {
        recognition.start();
        listening = true;
        hooks.onState?.('listening');
        return;
      } catch {
        /* already started */
      }
    }
    hooks.onState?.('idle');
  };

  recognition.onerror = (event) => {
    const message = event.error === 'not-allowed'
      ? 'Microphone permission denied'
      : event.error === 'no-speech'
        ? 'No speech heard'
        : `Speech error: ${event.error}`;
    hooks.onError?.(message);
    hooks.onState?.('error');
  };

  recognition.onresult = (event) => {
    let interim = '';
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? '';
      if (result.isFinal) finalText += text;
      else interim += text;
    }
    const trimmedInterim = interim.trim();
    const trimmedFinal = finalText.trim();
    if (trimmedInterim) hooks.onInterim?.(trimmedInterim);
    if (trimmedFinal) hooks.onFinal?.(trimmedFinal);
  };

  return {
    isListening: () => listening,
    start() {
      autoContinue = true;
      if (listening) return;
      try {
        recognition.start();
      } catch (err) {
        hooks.onError?.(err instanceof Error ? err.message : String(err));
      }
    },
    stop() {
      autoContinue = false;
      if (!listening) return;
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
    abort() {
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
      listening = false;
      hooks.onState?.('idle');
    },
  };
}
