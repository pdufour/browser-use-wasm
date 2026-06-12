import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const wasmPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'node_modules/@wllama/wllama/esm/wasm/wllama.wasm'
);

const WASM_ROUTE = '/wllama/wllama.wasm';

function serveWasm(req, res, next) {
  if (req.url?.split('?')[0] !== WASM_ROUTE) {
    return next();
  }

  if (!fs.existsSync(wasmPath)) {
    res.statusCode = 404;
    res.end('wllama.wasm missing — run npm install');
    return;
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Type', 'application/wasm');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(wasmPath).pipe(res);
}

/** Same-origin wllama.wasm for COOP/COEP (no jsDelivr). Browser inference only. */
export function wllamaWasmPlugin() {
  return {
    name: 'wllama-wasm',
    configureServer(server) {
      server.middlewares.use(serveWasm);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveWasm);
    },
  };
}
