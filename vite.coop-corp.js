/**
 * COEP `require-corp` needs every dev/preview response to opt in via CORP.
 * Without this, Chrome blocks wasm/worker assets and warns about isolation.
 */

function coopCoepCorpMiddleware() {
  return (_req, res, next) => {
    if (!res.headersSent) {
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
    next();
  };
}

/** Apply CORP on all Vite dev/preview responses (wasm, workers, modules). */
export function coopCoepCorpPlugin() {
  return {
    name: 'coop-coep-corp',
    configureServer(server) {
      server.middlewares.use(coopCoepCorpMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(coopCoepCorpMiddleware());
    },
  };
}
