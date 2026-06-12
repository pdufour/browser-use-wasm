/**
 * Browser environment checks — what can load and run here.
 * wllama needs cross-origin isolation (COOP/COEP) for SharedArrayBuffer and
 * WebGPU (Chrome/Edge) for usable inference speed.
 */

function navigatorGpu(): unknown {
  return (navigator as Navigator & { gpu?: unknown }).gpu;
}

function isGitHubPagesHost(): boolean {
  return typeof location !== 'undefined' && /\.github\.io$/i.test(location.hostname);
}

/** Blocking issues that prevent the WASM worker from loading a model. */
export function getWllamaEnvIssues(): string[] {
  const issues: string[] = [];
  if (typeof SharedArrayBuffer === 'undefined') {
    if (!globalThis.crossOriginIsolated) {
      issues.push(
        isGitHubPagesHost()
          ? 'Cross-Origin Isolation starting — GitHub Pages reloads once on first visit, then Run works'
          : 'Cross-Origin Isolation off — WASM needs COOP/COEP (run npm run dev or npm run preview, not file://)'
      );
    } else {
      issues.push('SharedArrayBuffer unavailable — use Chrome or Edge');
    }
  }
  if (!navigatorGpu()) {
    issues.push('WebGPU not supported in this browser');
  }
  return issues;
}

/** Main-thread WebGPU + JSPI signal (the worker probe is authoritative). */
export function hasMainThreadWebGpu(): boolean {
  return !!(
    navigatorGpu() && (WebAssembly as unknown as { Suspending?: unknown }).Suspending
  );
}

/** Approximate device RAM in GB (Chrome only; undefined elsewhere). */
export function deviceMemoryGb(): number | undefined {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}
