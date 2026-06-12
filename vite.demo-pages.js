import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Demo pages outside Vite `root` (examples/home at `/`).
 * Operator app at `/home/`; marketing homepage is Vite `root`.
 */
export const DEMO_PAGES = [
  { id: 'operator', route: '/home', dir: 'examples/operator' },
  { id: 'gallery', route: '/gallery', dir: 'examples/gallery' },
  { id: 'browse', route: '/browse', dir: 'examples/browse' },
  { id: 'video', route: '/video', dir: 'examples/video' },
];

/** Old per-fixture demo routes → gallery or browse presets. */
export const LEGACY_DEMO_REDIRECTS = new Map([
  ['/minimal', '/gallery/'],
  ['/minimal/', '/gallery/'],
  ['/voice', '/gallery/'],
  ['/voice/', '/gallery/'],
  ['/forms', '/gallery/'],
  ['/forms/', '/gallery/'],
  ['/shop', '/browse/?url=%2Fbrowse-fixture%2Findex.html&goal=click%20Submit'],
  ['/shop/', '/browse/?url=%2Fbrowse-fixture%2Findex.html&goal=click%20Submit'],
  ['/embed', '/gallery/'],
  ['/embed/', '/gallery/'],
  ['/try-it', '/browse/?url=%2Fbrowse-fixture%2Findex.html&goal=click%20Submit'],
  ['/try-it/', '/browse/?url=%2Fbrowse-fixture%2Findex.html&goal=click%20Submit'],
  ['/welcome', '/'],
  ['/welcome/', '/'],
  ['/workflows', '/browse/?url=%2Fbrowse-fixture%2Findex.html&goal=open%20Help%20and%20type%20e2e%40test.com%20in%20the%20contact%20email%20field'],
  ['/workflows/', '/browse/?url=%2Fbrowse-fixture%2Findex.html&goal=open%20Help%20and%20type%20e2e%40test.com%20in%20the%20contact%20email%20field'],
  ['/grounding', '/gallery/'],
  ['/grounding/', '/gallery/'],
  ['/models', '/gallery/'],
  ['/models/', '/gallery/'],
]);

export function demoPagePath(page) {
  return path.join(repoRoot, page.dir, 'index.html');
}

export function demoDirPath(page) {
  return path.join(repoRoot, page.dir);
}

/** Rollup MPA inputs: homepage at `/` + demo entries (operator at `/home/`). */
export function buildExamplePages(homeHtml) {
  return {
    index: homeHtml,
    ...Object.fromEntries(DEMO_PAGES.map((p) => [p.id, demoPagePath(p)])),
  };
}

const sharedDir = path.join(repoRoot, 'examples/shared');

/**
 * Rewrite relative asset refs to clean route URLs (not browser-facing /@fs/).
 * demoAssetsPlugin rewrites those URLs to /@fs/ server-side for Vite transform.
 */
function rewriteRelativeAssets(html, route) {
  return html
    .replace(
      /((?:src|href)=["'])\.\.\/shared\/([^"']+)(["'])/g,
      (_m, pre, rel, post) => `${pre}/shared/${rel}${post}`
    )
    .replace(
      /((?:src|href)=["'])\.\/([^"']+)(["'])/g,
      (_m, pre, rel, post) => `${pre}${route}/${rel}${post}`
    );
}

/** Vite transformIndexHtml may inject /@fs/ paths — strip back to clean demo URLs. */
function stripFsUrls(html, demoDir, route) {
  let out = html;
  const demoFs = `/@fs${demoDir}/`;
  if (out.includes(demoFs)) {
    out = out.replaceAll(demoFs, `${route}/`);
  }
  const sharedFs = `/@fs${sharedDir}/`;
  if (out.includes(sharedFs)) {
    out = out.replaceAll(sharedFs, '/shared/');
  }
  return out;
}

/**
 * Serve MPA HTML entries outside Vite `root` (examples/* outside operator).
 */
export function demoHtmlPlugin({ route, file }) {
  const demoDir = path.dirname(file);
  const serve = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const raw = req.url ?? '';
      const pathname = raw.split('?')[0];
      const match =
        pathname === route || pathname === `${route}/` || pathname === `${route}/index.html`;
      if (!match) return next();
      try {
        let html = fs.readFileSync(file, 'utf-8');
        html = rewriteRelativeAssets(html, route);
        html = await server.transformIndexHtml(`${route}/`, html, raw);
        html = stripFsUrls(html, demoDir, route);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        // Match vite.config server.headers — wllama needs cross-origin isolation.
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        res.end(html);
      } catch (err) {
        next(err);
      }
    });
  };

  return {
    name: `demo-html-${route.replace(/\//g, '-')}`,
    enforce: 'pre',
    configureServer: serve,
    configurePreviewServer: serve,
  };
}

/** Proxy route-prefixed demo assets to /@fs/ so Vite transforms JS/CSS outside `root`. */
export function demoAssetsPlugin(demoDir, route) {
  const prefix = `${route}/`;
  const serve = () => {
    return (req, _res, next) => {
      const raw = req.url ?? '';
      const pathname = raw.split('?')[0];
      if (!pathname.startsWith(prefix)) return next();
      const rel = pathname.slice(prefix.length);
      if (!rel || rel.includes('..') || rel === 'index.html') return next();
      const file = path.join(demoDir, rel);
      if (!file.startsWith(demoDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return next();
      }
      const qs = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
      req.url = `/@fs/${file}${qs}`;
      next();
    };
  };
  return {
    name: `demo-assets-${route.replace(/\//g, '-')}`,
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(serve());
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve());
    },
  };
}

/** examples/shared/* at /shared/ (marker.css, etc.). */
function sharedAssetsPlugin() {
  const prefix = '/shared/';
  const serve = () => {
    return (req, _res, next) => {
      const raw = req.url ?? '';
      const pathname = raw.split('?')[0];
      if (!pathname.startsWith(prefix)) return next();
      const rel = pathname.slice(prefix.length);
      if (!rel || rel.includes('..')) return next();
      const file = path.join(sharedDir, rel);
      if (!file.startsWith(sharedDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return next();
      }
      const qs = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
      req.url = `/@fs/${file}${qs}`;
      next();
    };
  };
  return {
    name: 'demo-shared-assets',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(serve());
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve());
    },
  };
}

/** Redirect retired demo routes to gallery / browse presets. */
function legacyDemoRedirectPlugin() {
  const serve = (req, res, next) => {
    const raw = req.url ?? '';
    const pathname = raw.split('?')[0];
    const target = LEGACY_DEMO_REDIRECTS.get(pathname);
    if (!target) return next();
    res.statusCode = 302;
    res.setHeader('Location', target);
    res.end();
  };
  return {
    name: 'legacy-demo-redirects',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}

/** Redirect `/demo` → `/demo/index.html` for dev + preview. */
function demoRewritePlugin() {
  const rewrites = new Map();
  for (const page of DEMO_PAGES) {
    rewrites.set(page.route, `${page.route}/index.html`);
    rewrites.set(`${page.route}/`, `${page.route}/index.html`);
  }
  const rewrite = (req, _res, next) => {
    const raw = req.url ?? '';
    const pathname = raw.split('?')[0];
    const target = rewrites.get(pathname);
    if (target) {
      const qs = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
      req.url = `${target}${qs}`;
    }
    next();
  };
  return {
    name: 'demo-pages-rewrite',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

/** Let Vite resolve /gallery/main.js (etc.) to files outside `root`. */
function demoRouteResolvePlugin() {
  const mappings = [
    ...DEMO_PAGES.map((page) => ({ prefix: `${page.route}/`, dir: demoDirPath(page) })),
    { prefix: '/shared/', dir: path.join(repoRoot, 'examples/shared') },
  ];

  return {
    name: 'demo-route-resolve',
    enforce: 'pre',
    resolveId(id) {
      const clean = id.split('?')[0];
      for (const { prefix, dir } of mappings) {
        if (!clean.startsWith(prefix)) continue;
        const rel = clean.slice(prefix.length);
        if (!rel || rel.includes('..')) return null;
        const file = path.join(dir, rel);
        if (file.startsWith(dir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          return file;
        }
      }
      return null;
    },
  };
}

/** One plugin bundle: rewrites + HTML serve + static assets for every demo route. */
export function createDemoPagesPlugins() {
  const plugins = [
    legacyDemoRedirectPlugin(),
    demoRewritePlugin(),
    demoRouteResolvePlugin(),
    sharedAssetsPlugin(),
  ];
  for (const page of DEMO_PAGES) {
    const file = demoPagePath(page);
    const dir = demoDirPath(page);
    plugins.push(demoHtmlPlugin({ route: page.route, file }));
    plugins.push(demoAssetsPlugin(dir, page.route));
  }
  return plugins;
}
