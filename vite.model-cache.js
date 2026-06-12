import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const modelCacheDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '.model-cache'
);

function parseRange(rangeHeader, size) {
  const m = /^bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (!m) return null;

  let start = m[1] === '' ? size - parseInt(m[2], 10) : parseInt(m[1], 10);
  let end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return null;
  }
  end = Math.min(end, size - 1);
  return { start, end };
}

/** Serve .model-cache/ at /model-cache/ with CORP for COEP. */
export function modelCachePlugin() {
  const serve = (req, res, next) => {
    if (!req.url?.startsWith('/model-cache/')) {
      return next();
    }

    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.statusCode = 405;
      res.end();
      return;
    }

    const rel = decodeURIComponent(req.url.slice('/model-cache/'.length).split('?')[0]);
    if (!rel || rel.includes('..')) {
      res.statusCode = 400;
      res.end();
      return;
    }

    const file = path.join(modelCacheDir, rel);
    if (!file.startsWith(modelCacheDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }

    const stat = fs.statSync(file);
    const size = stat.size;
    const etag = `"${stat.mtimeMs.toString(16)}-${size.toString(16)}"`;

    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return;
    }

    if (method === 'HEAD') {
      res.statusCode = 200;
      res.setHeader('Content-Length', String(size));
      res.end();
      return;
    }

    const range = req.headers.range;
    if (range) {
      const parsed = parseRange(range, size);
      if (!parsed) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      const { start, end } = parsed;
      const chunk = end - start + 1;
      res.statusCode = 206;
      res.setHeader('Content-Length', String(chunk));
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Length', String(size));
    fs.createReadStream(file).pipe(res);
  };

  return {
    name: 'model-cache',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}
