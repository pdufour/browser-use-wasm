/**
 * Thin perf helpers for examples — wraps src/util/perf for consistent E2E lines.
 */
import { logPerfEvent } from 'browser-use-wasm';

export { logPerfEvent };

export function logCaptureWallPerf(t0) {
  logPerfEvent('capture', { wallMs: performance.now() - t0 });
}

export function logTaskPerf(result) {
  logPerfEvent('task', {
    inferMs: result.inferMs,
    wallMs: result.wallMs,
  });
}
