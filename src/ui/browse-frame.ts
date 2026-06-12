/**
 * In-app browser iframe: built-in sample page or /browse?u= proxy for external HTML.
 *
 * DOM contract: the embedding page hosts `<iframe id="browse-frame">`; the
 * page under capture exposes `#capture-target` (falls back to its body).
 */

/** Home page the frame falls back to — set by the embedding app, not the library. */
let browseHomePath = '/';
let browseHomePathPrefix = '';

export function setBrowseHomePath(path: string): void {
  browseHomePath = path;
  browseHomePathPrefix = path.replace(/\/index\.html$/, '');
}

export function getBrowseHomePath(): string {
  return browseHomePath;
}

const BROWSE_NAV_TIMEOUT_MS = 20_000;

export interface BrowseNavigation {
  frameSrc: string;
  addressBar: string;
  external: boolean;
}

/** Bumped to cancel in-flight iframe navigation. */
let browseNavGeneration = 0;

export function getBrowseFrame(): HTMLIFrameElement | null {
  return document.getElementById('browse-frame') as HTMLIFrameElement | null;
}

export function getBrowseDocument(): Document | null {
  return getBrowseFrame()?.contentDocument ?? null;
}

/**
 * SnapDOM / voice target inside the active page.
 */
export function getCaptureElement(): HTMLElement | null {
  const doc = getBrowseDocument();
  if (!doc) return null;
  return (
    (doc.getElementById('capture-target') as HTMLElement | null) ??
    doc.body
  );
}

export function normalizeUserUrl(input: string): string {
  const t = String(input ?? '').trim();
  if (!t || t === 'about:blank') return browseHomePath;
  if (browseHomePathPrefix && (t === browseHomePathPrefix || t === `${browseHomePathPrefix}/`))
    return browseHomePath;
  if (t.startsWith('/')) return t;
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (u.origin === location.origin) {
        const p = u.pathname;
        if (browseHomePathPrefix && (p === browseHomePathPrefix || p === `${browseHomePathPrefix}/`))
          return browseHomePath;
        if (p.startsWith('/')) return `${p}${u.search}`;
      }
    } catch {
      /* keep absolute URL for external proxy */
    }
    return t;
  }
  return `https://${t}`;
}

export function toBrowseProxyPath(absoluteUrl: string): string {
  return `/browse?u=${encodeURIComponent(absoluteUrl)}`;
}

export function resolveBrowseNavigation(input: string): BrowseNavigation {
  const norm = normalizeUserUrl(input);
  if (norm.startsWith('/')) {
    return { frameSrc: norm, addressBar: `${location.origin}${norm}`, external: false };
  }
  return {
    frameSrc: toBrowseProxyPath(norm),
    addressBar: norm,
    external: true,
  };
}

function frameDocumentHref(frame: HTMLIFrameElement): string {
  try {
    return frame.contentWindow?.location?.href ?? '';
  } catch {
    return '';
  }
}

/** Prefer committed iframe URL; during first paint `contentWindow` may still be `about:blank`. */
function frameBrowseHref(frame: HTMLIFrameElement): string {
  const docHref = frameDocumentHref(frame);
  if (docHref && !/\/about:blank$/i.test(docHref)) return docHref;
  const attrSrc = frame.getAttribute('src')?.trim();
  if (attrSrc) {
    try {
      return new URL(attrSrc, location.origin).href;
    } catch {
      return attrSrc;
    }
  }
  return frame.src && !/^about:blank$/i.test(frame.src) ? frame.src : docHref;
}

export function browseNavigationNeedsReload(input: string): boolean {
  const frame = getBrowseFrame();
  if (!frame) return false;
  const nav = resolveBrowseNavigation(input);
  const targetHref = new URL(nav.frameSrc, location.origin).href;
  return sameBrowseFrameUrl(frameBrowseHref(frame), targetHref);
}

function sameBrowseFrameUrl(a: string, b: string): boolean {
  try {
    const ua = new URL(a, location.origin);
    const ub = new URL(b, location.origin);
    return ua.pathname === ub.pathname && ua.search === ub.search;
  } catch {
    return a === b;
  }
}

/**
 * @param opts Pass `reload: true` for address-bar Go / refresh (same URL must reload).
 */
export function navigateBrowseFrame(
  input: string,
  opts: { reload?: boolean } = {}
): Promise<{ frameSrc: string; addressBar: string }> {
  const frame = getBrowseFrame();
  if (!frame) return Promise.reject(new Error('Browse frame missing'));
  const nav = resolveBrowseNavigation(input);
  const targetHref = new URL(nav.frameSrc, location.origin).href;
  const currentHref = frameBrowseHref(frame);
  const reload = opts.reload === true;

  if (!reload && sameBrowseFrameUrl(currentHref, targetHref)) {
    const doc = frame.contentDocument;
    if (doc?.readyState === 'complete') {
      return Promise.resolve({ frameSrc: nav.frameSrc, addressBar: nav.addressBar });
    }
    const gen = ++browseNavGeneration;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = <T,>(fn: (arg: T) => void, arg: T) => {
        if (settled || gen !== browseNavGeneration) {
          if (!settled && gen !== browseNavGeneration) {
            settled = true;
            clearTimeout(timer);
            frame.removeEventListener('load', onLoad);
            frame.removeEventListener('error', onErr);
            reject(new Error('Navigation stopped'));
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        frame.removeEventListener('load', onLoad);
        frame.removeEventListener('error', onErr);
        fn(arg);
      };
      const onLoad = () => finish(resolve, nav);
      const onErr = () => finish(reject, new Error('Page failed to load'));
      const timer = setTimeout(
        () => finish(reject, new Error(`Page load timed out (${BROWSE_NAV_TIMEOUT_MS / 1000}s)`)),
        BROWSE_NAV_TIMEOUT_MS
      );
      frame.addEventListener('load', onLoad);
      frame.addEventListener('error', onErr);
    });
  }

  const gen = ++browseNavGeneration;
  return new Promise((resolve, reject) => {
    let settled = false;
    /** Same-URL reload: blank hop forces a `load` when reassigning an unchanged `src`. */
    let blankHop = false;
    const detach = () => {
      frame.removeEventListener('load', onLoad);
      frame.removeEventListener('error', onErr);
    };
    const finish = <T,>(fn: (arg: T) => void, arg: T) => {
      if (settled || gen !== browseNavGeneration) {
        if (!settled && gen !== browseNavGeneration) {
          settled = true;
          clearTimeout(timer);
          detach();
          reject(new Error('Navigation stopped'));
        }
        return;
      }
      settled = true;
      clearTimeout(timer);
      detach();
      fn(arg);
    };
    const onLoad = () => {
      if (blankHop) {
        blankHop = false;
        frame.src = nav.frameSrc;
        return;
      }
      finish(resolve, nav);
    };
    const onErr = () => finish(reject, new Error('Page failed to load'));
    const timer = setTimeout(
      () => finish(reject, new Error(`Page load timed out (${BROWSE_NAV_TIMEOUT_MS / 1000}s)`)),
      BROWSE_NAV_TIMEOUT_MS
    );
    frame.addEventListener('load', onLoad);
    frame.addEventListener('error', onErr);
    const readyPoll = () => {
      if (settled || gen !== browseNavGeneration || blankHop) {
        if (!settled && gen === browseNavGeneration) requestAnimationFrame(readyPoll);
        return;
      }
      if (!sameBrowseFrameUrl(frameBrowseHref(frame), targetHref)) {
        requestAnimationFrame(readyPoll);
        return;
      }
      const doc = frame.contentDocument;
      const root = doc?.getElementById('capture-target') ?? doc?.body;
      if (doc?.readyState === 'complete' && root && root.offsetWidth > 0) {
        finish(resolve, nav);
        return;
      }
      requestAnimationFrame(readyPoll);
    };
    requestAnimationFrame(readyPoll);
    if (reload && sameBrowseFrameUrl(currentHref, targetHref)) {
      blankHop = true;
      frame.src = 'about:blank';
    } else {
      frame.src = nav.frameSrc;
    }
  });
}

export function waitForBrowseFrameReady(
  frame: HTMLIFrameElement | null,
  timeoutMs: number = 20_000
): Promise<HTMLElement> {
  if (!frame) {
    return Promise.reject(new Error('Browse frame missing'));
  }
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      const doc = frame.contentDocument;
      const root = doc?.getElementById('capture-target') ?? doc?.body;
      
      if (doc?.readyState === 'complete' && root && root.offsetWidth > 0) {
        resolve(root);
        return;
      }

      if (performance.now() - t0 > timeoutMs) {
        reject(new Error('Browse frame did not become ready'));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}
