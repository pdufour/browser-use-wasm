/**
 * JSPI (WebAssembly.Suspending) support for wllama + WebGPU.
 *
 * Native JSPI: Chrome 137+, or Firefox with
 * `javascript.options.wasm_js_promise_integration` in about:config.
 *
 * When native JSPI is missing, @wllama/wllama prepends its own polyfill into the
 * *inner* WASM worker at bootstrap (`node_modules/@wllama/wllama/src/worker.ts`).
 * Do not polyfill on this outer RPC worker — that can mask native JSPI and does not
 * help the nested worker where llama.cpp actually runs.
 */

export type JspiMode = 'native' | 'wllama-inner-polyfill';

export interface JspiDiagnostics {
  /** Native `WebAssembly.Suspending` is available in this thread. */
  enabled: boolean;
  mode: JspiMode;
  suspending: boolean;
  promising: boolean;
}

export function jspiDiagnostics(): JspiDiagnostics {
  const wasm = WebAssembly as typeof WebAssembly & {
    Suspending?: unknown;
    promising?: unknown;
  };
  const suspending = typeof wasm.Suspending === 'function';
  const promising = typeof wasm.promising === 'function';
  const enabled = suspending;
  return {
    enabled,
    mode: enabled ? 'native' : 'wllama-inner-polyfill',
    suspending,
    promising,
  };
}

export function hasNativeJspi(): boolean {
  return jspiDiagnostics().enabled;
}

/** How this worker thread will run wllama WASM (diagnostics only). */
export function jspiMode(): JspiMode {
  return jspiDiagnostics().mode;
}

export function logJspiSupport(scope = 'wllama-worker'): void {
  const d = jspiDiagnostics();
  console.info(
    `[${scope}] JSPI ${d.enabled ? 'enabled' : 'disabled'} (mode=${d.mode}, Suspending=${d.suspending}, promising=${d.promising})`
  );
}
