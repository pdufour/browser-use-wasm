/**
 * @wllama/wllama embeds llama.cpp with ENVIRONMENT_IS_NODE = process.versions.node.
 * Vite's worker bundle can polyfill `process`, which makes WASM spawn Node worker_threads
 * instead of browser Workers. Inference must stay browser-only — never Node.
 */
if (typeof WorkerGlobalScope !== 'undefined') {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
  if (proc?.versions?.node) {
    try {
      delete proc.versions.node;
    } catch {
      try {
        Object.defineProperty(proc, 'versions', {
          value: {},
          configurable: true,
          writable: true,
        });
      } catch {
        /* ignore */
      }
    }
  }
}
