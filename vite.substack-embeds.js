import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const embedsDir = path.join(repoRoot, 'docs/substack/embeds');
const prefix = '/substack/embeds/';

/** Datawrapper iframe pages — served without COEP so third-party embeds load. */
export function substackEmbedsPlugin() {
  const serve = (req, res, next) => {
    const raw = req.url ?? '';
    const pathname = raw.split('?')[0];
    if (!pathname.startsWith(prefix)) return next();

    const rel = pathname.slice(prefix.length);
    if (!rel || rel.includes('..')) return next();
    const file = path.join(embedsDir, rel);
    if (!file.startsWith(embedsDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return next();
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.end(fs.readFileSync(file));
  };

  return {
    name: 'substack-embeds',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}
