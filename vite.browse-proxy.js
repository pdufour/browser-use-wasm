/**
 * Same-origin browse proxy for dev/preview — loads external HTML into the iframe.
 * Not inference; static mirror for SnapDOM capture only.
 */

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

/**
 * @param {string} html
 * @param {string} pageUrl
 */
function prepareProxiedHtml(html, pageUrl) {
  const base = new URL(pageUrl);
  const baseTag = `<base href="${base.origin}/">`;
  let out = html;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);
  } else {
    out = `${baseTag}\n${out}`;
  }
  out = out.replace(/<meta[^>]+http-equiv=["']?content-security-policy[^>]*>/gi, '');
  // Static mirror only — strip scripts so proxied pages cannot run JS in the iframe.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<script\b[^>]*\/>/gi, '');
  out = out.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/<body([^>]*)>/i, (m, attrs) =>
    /\bid=/i.test(attrs) ? m : `<body id="capture-target"${attrs}>`
  );
  return out;
}

/**
 * @param {string} targetUrl
 */
function validateBrowseUrl(targetUrl) {
  const parsed = new URL(targetUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http(s) URLs are allowed');
  }
  if (BLOCKED_HOSTS.has(parsed.hostname)) {
    throw new Error('Cannot browse localhost via proxy — use /browse-fixture/index.html for the built-in sample page');
  }
  return parsed.href;
}

export function browseProxyPlugin() {
  const handler = async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://placeholder');
    if (url.pathname === '/browse-fixture' || url.pathname === '/browse-fixture/') {
      res.statusCode = 302;
      res.setHeader('Location', '/browse-fixture/index.html');
      res.end();
      return;
    }
    if (url.pathname !== '/browse') return next();

    const target = url.searchParams.get('u');
    if (!target) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Missing ?u= URL parameter');
      return;
    }

    try {
      const href = validateBrowseUrl(target);
      const upstream = await fetch(href, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; browser-use-wasm/1.0; +https://github.com/showlab/ShowUI-2B)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });

      const contentType = upstream.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        res.statusCode = 415;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`Not an HTML page (${contentType || 'unknown type'})`);
        return;
      }

      const html = prepareProxiedHtml(await upstream.text(), upstream.url || href);
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.end(html);
    } catch (err) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const msg = err instanceof Error ? err.message : String(err);
      res.end(
        `<!DOCTYPE html><body id="capture-target"><main><h1>Could not load page</h1><p>${msg}</p></main></body>`
      );
    }
  };

  return {
    name: 'browse-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
