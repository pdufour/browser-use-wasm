/** Lightweight console diagnostics for browse/video demos (filter: demo:). */
import { jspiDiagnostics } from 'browser-use-wasm';

const params = new URLSearchParams(location.search);
const verbose = params.has('debug') || params.get('log') === '1';

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

/** @param {string} scope @param {string} message @param {Record<string, unknown>} [data] */
export function demoLog(scope, message, data) {
  if (data === undefined) {
    console.log(`[demo:${scope}] ${stamp()} ${message}`);
    return;
  }
  console.log(`[demo:${scope}] ${stamp()} ${message}`, data);
}

/** @param {string} scope @param {string} message @param {Record<string, unknown>} [data] */
export function demoWarn(scope, message, data) {
  if (data === undefined) {
    console.warn(`[demo:${scope}] ${stamp()} ${message}`);
    return;
  }
  console.warn(`[demo:${scope}] ${stamp()} ${message}`, data);
}

/** @param {string} scope */
export function demoLogEnv(scope) {
  const jspi = jspiDiagnostics();
  demoLog(scope, 'environment', {
    href: location.href,
    base: import.meta.env.BASE_URL,
    path: location.pathname,
    search: location.search,
    crossOriginIsolated: globalThis.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    jspiEnabled: jspi.enabled,
    jspiMode: jspi.mode,
    jspiSuspending: jspi.suspending,
    jspiPromising: jspi.promising,
    pagesBuild: globalThis.__PAGES_BUILD__ ?? null,
    verbose,
  });
  console.info(
    `[demo:${scope}] JSPI ${jspi.enabled ? 'enabled' : 'disabled'} (mode=${jspi.mode}, Suspending=${jspi.suspending}, promising=${jspi.promising})`
  );
}

/** @param {string} phase */
export function logGoalBarState(phase) {
  const form = document.getElementById('goal-form');
  const input = document.getElementById('prompt');
  const btn = document.getElementById('btn-run');
  const main = document.querySelector('.browse-main, .video-main');

  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
      inViewport: r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0,
    };
  };

  const style = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      display: s.display,
      visibility: s.visibility,
      opacity: s.opacity,
      flexShrink: s.flexShrink,
    };
  };

  const snapshot = {
    phase,
    scrollY: Math.round(window.scrollY),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    main: rect(main),
    form: rect(form),
    input: rect(input),
    runBtn: rect(btn),
    runBtnDisabled: btn?.disabled ?? null,
    runBtnHidden: btn?.hidden ?? null,
    runBtnText: btn?.textContent?.trim() ?? null,
  };

  if (verbose) {
    snapshot.formStyle = style(form);
    snapshot.runBtnStyle = style(btn);
    snapshot.mainStyle = style(main);
  }

  const missing = !btn || !form;
  const collapsed = btn && rect(btn)?.height === 0;
  const offscreen = btn && rect(btn)?.inViewport === false;

  if (missing || collapsed || offscreen) {
    demoWarn('run-ui', 'goal bar issue', snapshot);
  } else {
    demoLog('run-ui', 'goal bar ok', snapshot);
  }

  return snapshot;
}

/** @param {string} scope */
export function wireDemoErrorLogging(scope) {
  window.addEventListener('error', (e) => {
    demoWarn(scope, 'window error', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    demoWarn(scope, 'unhandled rejection', {
      reason: e.reason instanceof Error ? e.reason.message : String(e.reason),
    });
  });
}
