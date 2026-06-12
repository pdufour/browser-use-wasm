/**
 * Vite `base` aware paths — `/` in dev, `/browser-use-wasm/` on GitHub Pages.
 */

type ViteMeta = ImportMeta & { env?: { BASE_URL?: string } };

/** Vite `base` with trailing slash. */
export function appBasePath(): string {
  const base = (import.meta as ViteMeta).env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** Prefix a site-root-relative path once (`wllama/wllama.wasm`). */
export function withAppBase(relPath: string): string {
  return `${appBasePath()}${String(relPath ?? '').replace(/^\//, '')}`;
}

/** Same-origin absolute URL under the Vite base. */
export function appBaseUrl(relPath: string, origin?: string): string {
  const host =
    origin ?? (typeof location !== 'undefined' ? location.origin : 'http://localhost');
  return new URL(withAppBase(relPath), host).href;
}

/** wllama WASM — must not use a bare `/wllama/…` path on project-site GH Pages. */
export function resolveWasmUrl(): string {
  return appBaseUrl('wllama/wllama.wasm');
}

/** `/model-cache/` (or `/browser-use-wasm/model-cache/` on Pages). */
export function modelCacheRootUrl(baseURI: string): URL {
  const origin = new URL(baseURI).origin;
  return new URL(withAppBase('model-cache/'), origin);
}
