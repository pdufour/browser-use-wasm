/**
 * GitHub Pages cannot set COOP/COEP response headers. Inject coi-serviceworker so
 * SharedArrayBuffer / wllama WASM works after one automatic reload.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const COI_FILE = 'coi-serviceworker.js';

function coiSrcPath() {
  return path.join(
    path.dirname(require.resolve('coi-serviceworker/package.json')),
    'coi-serviceworker.min.js'
  );
}

function resolveBuildId() {
  return (
    process.env.PAGES_BUILD_ID?.trim() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

/** @param {{ base?: string; buildId?: string }} [opts] */
export function coiPagesPlugin({ base = '/', buildId = resolveBuildId() } = {}) {
  const basePath = base.endsWith('/') ? base : `${base}/`;
  const coiHref = `${basePath}${COI_FILE}?v=${encodeURIComponent(buildId)}`;

  const injection = `    <!-- pages-build:${buildId} -->
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <script>
      window.__PAGES_BUILD__ = ${JSON.stringify(buildId)};
      (function () {
        var KEY = 'pages-build-id';
        var next = window.__PAGES_BUILD__;
        var prev = sessionStorage.getItem(KEY);
        if (prev && prev !== next && navigator.serviceWorker) {
          sessionStorage.setItem(KEY, next);
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            return Promise.all(regs.map(function (r) { return r.unregister(); }));
          }).then(function () { location.reload(); });
          return;
        }
        sessionStorage.setItem(KEY, next);
      })();
      window.coi = {
        coepCredentialless: function () { return true; },
        coepDegrade: function () { return true; },
        quiet: false,
      };
    </script>
    <script src="${coiHref}"></script>`;

  return {
    name: 'coi-pages',
    config() {
      return {
        define: {
          __PAGES_BUILD_ID__: JSON.stringify(buildId),
        },
      };
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (html.includes('pages-build:')) {
          return html.replace(/<!-- pages-build:[^>]+ -->/, `<!-- pages-build:${buildId} -->`);
        }
        return html.replace(/<head([^>]*)>/i, `<head$1>\n${injection}`);
      },
    },
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      fs.copyFileSync(coiSrcPath(), path.join(outDir, COI_FILE));
      fs.writeFileSync(
        path.join(outDir, 'pages-version.txt'),
        `${buildId}\n`,
        'utf8'
      );
    },
  };
}
