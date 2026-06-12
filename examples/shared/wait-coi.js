/**
 * Wait for cross-origin isolation (COOP/COEP). On GitHub Pages, coi-serviceworker
 * registers on first visit and reloads before WASM can run.
 */

/**
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ ready: boolean; reason?: string }>}
 */
export async function waitForCrossOriginIsolation({ timeoutMs = 12_000 } = {}) {
  if (globalThis.crossOriginIsolated) {
    return { ready: true };
  }

  const sw = navigator.serviceWorker;
  if (!sw) {
    return { ready: false, reason: 'no-service-worker' };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (globalThis.crossOriginIsolated) {
      return { ready: true };
    }

    const reg = await sw.getRegistration().catch(() => null);
    if (reg?.installing || (reg?.active && !sw.controller)) {
      return { ready: false, reason: 'coi-reload-pending' };
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return {
    ready: globalThis.crossOriginIsolated === true,
    reason: globalThis.crossOriginIsolated ? undefined : 'coi-timeout',
  };
}

/** @returns {boolean} */
export function isGitHubPagesHost() {
  return typeof location !== 'undefined' && /\.github\.io$/i.test(location.hostname);
}
