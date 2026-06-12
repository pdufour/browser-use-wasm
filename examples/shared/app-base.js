/** Vite `base` — `/` in dev, `/browser-use-wasm/` on GitHub Pages. */
export function appBase() {
  const base = import.meta.env.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** Prefix an app-root path (`/gallery/` → `/browser-use-wasm/gallery/` on Pages). */
export function withBase(path) {
  return `${appBase()}${String(path ?? '').replace(/^\//, '')}`;
}

/** Keep absolute http(s) URLs; prefix same-origin app paths once. */
export function resolveAppPath(path) {
  const raw = String(path ?? '').trim();
  if (!raw) return appBase();
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = appBase();
  if (raw.startsWith(base)) return raw;
  return withBase(raw);
}
