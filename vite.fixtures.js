import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(repoRoot, 'examples/operator/fixtures');
const taskSitesDir = path.join(repoRoot, 'examples/fixtures/tasks');

/** Stable public URLs → fixture directories (URLs unchanged across the repo reorg). */
const ROUTES = [
  { prefix: '/browse-fixture/', dir: path.join(fixturesDir, 'shop-demo') },
  { prefix: '/eval-snapshot/', dir: path.join(fixturesDir, 'eval-snapshot') },
  { prefix: '/design-mockups/', dir: path.join(repoRoot, 'public/design-mockups') },
  { prefix: '/sites/', dir: taskSitesDir },
  // MiniWoB++ corpus (gitignored — `npm run cache:miniwob`): eval scripts only.
  {
    prefix: '/miniwob/',
    dir: path.join(fixturesDir, 'miniwob/cache/miniwob-plusplus/miniwob/html'),
  },
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
};

/** Serve fixtures/ at the stable /browse-fixture/ and /eval-snapshot/ URLs (CORP for COEP). */
export function fixturesPlugin() {
  const serve = (req, res, next) => {
    const url = (req.url ?? '').split('?')[0];
    const route = ROUTES.find(
      (r) => url.startsWith(r.prefix) || url === r.prefix.slice(0, -1)
    );
    if (!route) return next();

    if (url === route.prefix.slice(0, -1) || url === route.prefix) {
      res.statusCode = 302;
      res.setHeader('Location', `${route.prefix}index.html`);
      res.end();
      return;
    }

    const rel = decodeURIComponent(url.slice(route.prefix.length));
    if (!rel || rel.includes('..')) {
      res.statusCode = 400;
      res.end();
      return;
    }

    const file = path.join(route.dir, rel);
    if (!file.startsWith(route.dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }

    res.statusCode = 200;
    // COEP parent pages require nested documents to opt in too.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Content-Type',
      CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
    );
    fs.createReadStream(file).pipe(res);
  };

  return {
    name: 'fixtures',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}
